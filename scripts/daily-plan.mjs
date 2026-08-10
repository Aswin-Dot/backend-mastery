#!/usr/bin/env node
/**
 * Daily plan notifier.
 *
 * Reads data/outline.json + progress.json, works out which module is due,
 * and comments on the repo's "Daily Plan" issue (creating it if absent).
 * The comment @mentions the repo owner, which is what turns it into a phone
 * push via the GitHub mobile app.
 *
 * Env:
 *   GITHUB_TOKEN     required unless DRY_RUN — provided by Actions
 *   GITHUB_REPOSITORY  owner/repo — provided by Actions
 *   NTFY_TOPIC       optional — also push to https://ntfy.sh/<topic>
 *   SITE_URL         optional — overrides the derived Pages URL
 *   DRY_RUN=1        print the comment instead of posting it
 *   TODAY            optional YYYY-MM-DD override, for testing
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DAY_MS = 86400000;
const TZ = "Asia/Kolkata";
const ISSUE_TITLE = "Daily Plan";
const ISSUE_LABEL = "daily-plan";

const DRY = process.env.DRY_RUN === "1";
const token = process.env.GITHUB_TOKEN;
const slug = process.env.GITHUB_REPOSITORY || "";
const [owner, repo] = slug.split("/");

const outline = JSON.parse(readFileSync(join(ROOT, "data/outline.json"), "utf8"));
const progressPath = join(ROOT, "progress.json");
const progress = existsSync(progressPath)
  ? JSON.parse(readFileSync(progressPath, "utf8"))
  : { modules: {} };

const siteUrl =
  process.env.SITE_URL ||
  `https://${(owner || outline.meta.githubOwner).toLowerCase()}.github.io/${repo || outline.meta.githubRepo}/`;

/* ── date helpers ──────────────────────────────────────── */

const stamp = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const dayNum = (s) => Math.floor(new Date(`${s}T00:00:00Z`).getTime() / DAY_MS);
const today = process.env.TODAY || stamp();

/* ── derive the plan ───────────────────────────────────── */

const core = outline.phases
  .flatMap((p) => p.modules.map((m) => ({ ...m, phase: p })))
  .sort((a, b) => a.day - b.day);

const isDone = (id) => progress.modules?.[id]?.status === "done";
const doneCount = core.filter((m) => isDone(m.id)).length;
const due = core.find((m) => !isDone(m.id)) || null;
const total = core.length;

function streak() {
  const days = new Set();
  for (const s of Object.values(progress.modules || {})) {
    if (s.status === "done" && s.completedAt) days.add(stamp(new Date(s.completedAt)));
  }
  if (!days.size) return 0;
  const nums = new Set([...days].map(dayNum));
  const t = dayNum(today);
  let cursor = nums.has(t) ? t : nums.has(t - 1) ? t - 1 : null;
  if (cursor === null) return 0;
  let n = 0;
  while (nums.has(cursor)) { n++; cursor--; }
  return n;
}

function idleDays() {
  if (!progress.lastActivity) return null;
  return dayNum(today) - dayNum(stamp(new Date(progress.lastActivity)));
}

function pace() {
  if (!progress.startedAt) return null;
  const elapsed = dayNum(today) - dayNum(stamp(new Date(progress.startedAt))) + 1;
  return doneCount - elapsed;
}

function fmtMins(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h} hr`;
}

/* ── compose ───────────────────────────────────────────── */

function statusLine() {
  const idle = idleDays();
  const p = pace();
  const bits = [`**${doneCount}/${total}** modules`];
  const s = streak();
  if (s > 1) bits.push(`🔥 **${s}-day** streak`);
  if (p !== null && p <= -2) bits.push(`⚠️ **${Math.abs(p)} days behind** the one-a-day pace`);
  else if (p !== null && p >= 2) bits.push(`**${p} days ahead**`);
  if (idle !== null && idle >= 2) bits.push(`nothing logged in **${idle} days**`);
  return bits.join(" · ");
}

function buildBody() {
  if (!due) {
    return [
      `## 🏔 All ${total} days complete`,
      "",
      `Every core module is done, @${owner}. The side quests are where the depth is now — Stripe end-to-end, the full NestJS port, deploying to AWS for real, load testing.`,
      "",
      `[Open the trail →](${siteUrl})`,
    ].join("\n");
  }

  const phase = due.phase;
  const idle = idleDays();
  const upcoming = core.filter((m) => !isDone(m.id)).slice(1, 4);

  // null = omit this block; "" = an intentional blank line in the markdown.
  return [
    `## Day ${due.day} · ${due.title}`,
    "",
    `**Phase ${phase.num} — ${phase.title}** · ${fmtMins(due.estMinutes)} · ${due.type}`,
    "",
    due.summary,
    "",
    idle !== null && idle >= 2
      ? `> You haven't logged a module in ${idle} days. One session gets the streak back — this one is ${fmtMins(due.estMinutes)}.`
      : null,
    idle !== null && idle >= 2 ? "" : null,
    `### 👉 [Open Day ${due.day} →](${siteUrl}#/module/${due.id})`,
    "",
    statusLine(),
    "",
    upcoming.length
      ? `<details><summary>Coming up</summary>\n\n${upcoming.map((m) => `- **Day ${m.day}** — ${m.title} *(${fmtMins(m.estMinutes)})*`).join("\n")}\n\n</details>`
      : null,
    "",
    `<sub>@${owner} · posted by the daily-plan workflow · ${today}</sub>`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function buildPush() {
  if (!due) return { title: "All 45 days complete 🏔", body: "The core path is done. Side quests await." };
  return {
    title: `Day ${due.day}: ${due.title}`,
    body: `${due.summary}\n\n${fmtMins(due.estMinutes)} · ${doneCount}/${total} done`,
  };
}

/* ── GitHub ────────────────────────────────────────────── */

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init.method || "GET"} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function findOrCreateIssue() {
  const open = await gh(`issues?state=open&labels=${ISSUE_LABEL}&per_page=1`);
  if (Array.isArray(open) && open.length) return open[0];

  // No labelled issue — fall back to title match before creating a duplicate.
  const all = await gh("issues?state=open&per_page=100");
  const match = all.find((i) => i.title === ISSUE_TITLE && !i.pull_request);
  if (match) return match;

  return gh("issues", {
    method: "POST",
    body: JSON.stringify({
      title: ISSUE_TITLE,
      labels: [ISSUE_LABEL],
      body: [
        "This issue is the daily drop-point for your learning plan.",
        "",
        `Every morning at 07:00 IST a workflow reads \`progress.json\`, works out which day is due, and comments here with a link straight to it. Because the comment @mentions you, GitHub sends a notification — install the GitHub mobile app and it lands as a push.`,
        "",
        `Site: ${siteUrl}`,
        "",
        "Closing this issue stops the notifications; the workflow will open a fresh one next run.",
      ].join("\n"),
    }),
  });
}

async function pushNtfy(topic) {
  const { title, body } = buildPush();
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: {
      Title: title,
      Priority: due ? "default" : "low",
      Tags: due ? "books" : "tada",
      ...(due ? { Click: `${siteUrl}#/module/${due.id}` } : {}),
    },
    body,
  });
  if (!res.ok) console.error(`ntfy push failed: ${res.status}`);
  else console.log(`ntfy pushed to topic "${topic}"`);
}

/* ── run ───────────────────────────────────────────────── */

const body = buildBody();

if (DRY) {
  console.log(`── DRY RUN ─ ${today} ─ ${owner || "?"}/${repo || "?"}\n`);
  console.log(body);
  console.log(`\n── push ──`);
  console.log(buildPush());
  process.exit(0);
}

if (!token || !owner || !repo) {
  console.error("Missing GITHUB_TOKEN or GITHUB_REPOSITORY. Set DRY_RUN=1 to test locally.");
  process.exit(1);
}

const issue = await findOrCreateIssue();
await gh(`issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
console.log(`Posted day ${due ? due.day : total} to issue #${issue.number}`);

if (process.env.NTFY_TOPIC) await pushNtfy(process.env.NTFY_TOPIC);
