/**
 * Progress state + derived stats + GitHub sync.
 *
 * localStorage is the local source of truth. When a token is configured,
 * completions are pushed to progress.json in the GitHub repo so the daily
 * alert workflow can read them and so progress follows you across devices.
 *
 * The token lives in localStorage under a separate key and is NEVER written
 * into progress.json, logged, or sent anywhere except api.github.com.
 */

const PROGRESS_KEY = "bm.progress.v1";
const SETTINGS_KEY = "bm.settings.v1";
const DAY_MS = 86400000;

const defaultProgress = () => ({
  version: 1,
  startsOn: null,      // planned Day 1 (YYYY-MM-DD) — anchors pace and the daily alert
  startedAt: null,     // when the first module was actually completed
  lastActivity: null,
  dailyMinutes: 90,
  timezone: "Asia/Kolkata",
  modules: {},
});

const defaultSettings = () => ({
  token: "",
  owner: "",
  repo: "",
  unlockAll: false,
  lastSynced: null,
});

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback();
    return { ...fallback(), ...JSON.parse(raw) };
  } catch {
    return fallback();
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing / quota — in-memory state still works for this session */
  }
}

/** Local calendar day (YYYY-MM-DD) in the learner's timezone. */
export function dayStamp(date = new Date(), timezone = "Asia/Kolkata") {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const dayNumber = (stamp) => Math.floor(new Date(`${stamp}T00:00:00Z`).getTime() / DAY_MS);

export class Store {
  constructor(outline) {
    this.outline = outline;
    this.progress = read(PROGRESS_KEY, defaultProgress);
    this.settings = read(SETTINGS_KEY, defaultSettings);

    if (!this.settings.owner) this.settings.owner = outline.meta.githubOwner || "";
    if (!this.settings.repo) this.settings.repo = outline.meta.githubRepo || "";

    // Flat ordered walk of the path: core modules in day order, each phase's
    // side quests trailing that phase.
    this.core = [];
    this.quests = [];
    this.byId = new Map();
    this.phaseOf = new Map();

    for (const phase of outline.phases) {
      for (const m of phase.modules) {
        const entry = { ...m, phase, optional: false };
        this.core.push(entry);
        this.byId.set(m.id, entry);
        this.phaseOf.set(m.id, phase);
      }
    }
    this.core.sort((a, b) => a.day - b.day);

    for (const sq of outline.sideQuests || []) {
      const phase = outline.phases.find((p) => p.id === sq.phase);
      const entry = { ...sq, phase, optional: true };
      this.quests.push(entry);
      this.byId.set(sq.id, entry);
      if (phase) this.phaseOf.set(sq.id, phase);
    }

    this.total = this.core.length;
  }

  // ── reads ───────────────────────────────────────────────
  get(id) { return this.byId.get(id); }
  state(id) { return this.progress.modules[id] || null; }
  isDone(id) { return this.state(id)?.status === "done"; }

  questsFor(phaseId) { return this.quests.filter((q) => q.phase?.id === phaseId); }

  doneCount() { return this.core.filter((m) => this.isDone(m.id)).length; }
  questDoneCount() { return this.quests.filter((q) => this.isDone(q.id)).length; }

  /** First core module that isn't done — what's due today. */
  nextModule() { return this.core.find((m) => !this.isDone(m.id)) || null; }

  /** Position on the path: 1-based, capped at the final day. */
  currentDay() {
    const next = this.nextModule();
    return next ? next.day : this.total;
  }

  /**
   * Locking: a core module opens once every earlier core module is done.
   * A side quest opens once its phase has been reached.
   */
  isUnlocked(id) {
    if (this.settings.unlockAll) return true;
    const entry = this.byId.get(id);
    if (!entry) return false;
    if (entry.optional) {
      const first = entry.phase?.modules?.[0];
      return first ? this.isUnlocked(first.id) : true;
    }
    return this.core.every((m) => m.day >= entry.day || this.isDone(m.id));
  }

  /** Consecutive days with at least one completion, counting back from today. */
  streak() {
    const tz = this.progress.timezone;
    const days = new Set();
    for (const s of Object.values(this.progress.modules)) {
      if (s.status === "done" && s.completedAt) days.add(dayStamp(new Date(s.completedAt), tz));
    }
    if (!days.size) return 0;

    const today = dayNumber(dayStamp(new Date(), tz));
    const nums = new Set([...days].map(dayNumber));
    // A streak stays alive if you finished something today or yesterday.
    let cursor = nums.has(today) ? today : nums.has(today - 1) ? today - 1 : null;
    if (cursor === null) return 0;

    let n = 0;
    while (nums.has(cursor)) { n++; cursor--; }
    return n;
  }

  /**
   * The scheduled Day 1 (YYYY-MM-DD). Falls back to the day of the first
   * completion so pace still works if no date was ever set.
   */
  plannedStart() {
    if (this.progress.startsOn) return this.progress.startsOn;
    if (this.progress.startedAt) return dayStamp(new Date(this.progress.startedAt), this.progress.timezone);
    return null;
  }

  /** Days until Day 1. 0 once underway, null if no start date is known. */
  daysUntilStart() {
    const start = this.plannedStart();
    if (!start) return null;
    const today = dayNumber(dayStamp(new Date(), this.progress.timezone));
    return Math.max(0, dayNumber(start) - today);
  }

  /** Days elapsed since Day 1, 1-based. 0 before the start date. */
  elapsedDays() {
    const start = this.plannedStart();
    if (!start) return null;
    const today = dayNumber(dayStamp(new Date(), this.progress.timezone));
    return Math.max(0, today - dayNumber(start) + 1);
  }

  /** Positive = ahead of the one-module-a-day pace, negative = behind. */
  pace() {
    const elapsed = this.elapsedDays();
    if (!elapsed) return null; // not started, or no start date
    return this.doneCount() - elapsed;
  }

  /** Projected finish at one module per day, anchored to the later of today/Day 1. */
  etaDate() {
    const remaining = this.total - this.doneCount();
    if (remaining <= 0) return null;
    const today = dayNumber(dayStamp(new Date(), this.progress.timezone));
    const start = this.plannedStart();
    const anchor = Math.max(today, start ? dayNumber(start) : today);
    return new Date((anchor + remaining - 1) * DAY_MS);
  }

  setStartDate(date) {
    this.progress.startsOn = date || null;
    this.touch();
  }

  minutesRemaining() {
    return this.core.filter((m) => !this.isDone(m.id)).reduce((sum, m) => sum + m.estMinutes, 0);
  }

  // ── writes ──────────────────────────────────────────────
  setTasks(id, tasks) {
    const s = this.progress.modules[id] || {};
    this.progress.modules[id] = { ...s, tasks };
    this.touch();
  }

  /** Record one quiz answer. Returns the running score as a 0..1 fraction. */
  setQuizAnswer(id, questionIndex, chosen, correctFlags) {
    const s = this.progress.modules[id] || {};
    const answers = Array.from(s.quizAnswers || []);
    answers[questionIndex] = chosen;
    const asked = answers.filter(Number.isInteger).length;
    const right = answers.reduce((n, a, i) => (Number.isInteger(a) && a === correctFlags[i] ? n + 1 : n), 0);
    const quizScore = asked ? right / correctFlags.length : 0;
    this.progress.modules[id] = { ...s, quizAnswers: answers, quizScore };
    this.touch();
    return quizScore;
  }

  complete(id) {
    const now = new Date().toISOString();
    const s = this.progress.modules[id] || {};
    this.progress.modules[id] = { ...s, status: "done", completedAt: s.completedAt || now };
    if (!this.progress.startedAt) this.progress.startedAt = now;
    this.touch();
  }

  uncomplete(id) {
    const s = this.progress.modules[id];
    if (!s) return;
    const { status, completedAt, ...rest } = s;
    this.progress.modules[id] = rest;
    this.touch();
  }

  touch() {
    this.progress.lastActivity = new Date().toISOString();
    write(PROGRESS_KEY, this.progress);
  }

  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    write(SETTINGS_KEY, this.settings);
  }

  // ── import / export ─────────────────────────────────────
  exportJson() { return JSON.stringify(this.progress, null, 2); }

  importJson(text) {
    const incoming = JSON.parse(text);
    if (!incoming || typeof incoming.modules !== "object") throw new Error("Not a progress file — no `modules` object.");
    this.progress = { ...defaultProgress(), ...incoming };
    write(PROGRESS_KEY, this.progress);
  }

  /** Union merge: keep every completion, prefer the earliest completedAt. */
  static merge(a, b) {
    const out = { ...a, modules: { ...a.modules } };
    for (const [id, remote] of Object.entries(b.modules || {})) {
      const local = out.modules[id];
      if (!local) { out.modules[id] = remote; continue; }
      const done = local.status === "done" || remote.status === "done";
      const stamps = [local.completedAt, remote.completedAt].filter(Boolean).sort();
      out.modules[id] = {
        ...remote,
        ...local,
        ...(done ? { status: "done" } : {}),
        ...(stamps.length ? { completedAt: stamps[0] } : {}),
        tasks: (local.tasks || []).map((v, i) => v || (remote.tasks || [])[i] || false),
        quizAnswers: mergeAnswers(local.quizAnswers, remote.quizAnswers),
        quizScore: Math.max(local.quizScore || 0, remote.quizScore || 0) || undefined,
      };
    }
    const starts = [a.startedAt, b.startedAt].filter(Boolean).sort();
    if (starts.length) out.startedAt = starts[0];
    out.startsOn = a.startsOn || b.startsOn || null;
    const acts = [a.lastActivity, b.lastActivity].filter(Boolean).sort();
    if (acts.length) out.lastActivity = acts[acts.length - 1];
    return out;
  }

  // ── GitHub sync ─────────────────────────────────────────
  get canSync() {
    return Boolean(this.settings.token && this.settings.owner && this.settings.repo);
  }

  async gh(path, init = {}) {
    const { owner, repo, token } = this.settings;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    return res;
  }

  async fetchRemote() {
    const res = await this.gh("contents/progress.json", { cache: "no-store" });
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) throw new Error(await describe(res));
    const json = await res.json();
    return { data: JSON.parse(fromBase64(json.content)), sha: json.sha };
  }

  /**
   * Push local progress, merging with whatever is on the remote first so a
   * completion recorded on another device is never clobbered.
   */
  async sync(message) {
    if (!this.canSync) throw new Error("Add a GitHub token in Settings first.");

    const push = async (attempt) => {
      const { data: remote, sha } = await this.fetchRemote();
      const merged = remote ? Store.merge(this.progress, remote) : this.progress;
      this.progress = merged;
      write(PROGRESS_KEY, this.progress);

      const body = {
        message: message || `progress: ${this.doneCount()}/${this.total} modules complete`,
        content: toBase64(JSON.stringify(merged, null, 2) + "\n"),
        ...(sha ? { sha } : {}),
      };
      const res = await this.gh("contents/progress.json", { method: "PUT", body: JSON.stringify(body) });
      if (res.status === 409 && attempt === 0) return push(1);
      if (!res.ok) throw new Error(await describe(res));
      return res.json();
    };

    await push(0);
    this.saveSettings({ lastSynced: new Date().toISOString() });
  }

  /** Pull remote into local (used on boot when a token exists). */
  async pull() {
    if (!this.canSync) return false;
    const { data } = await this.fetchRemote();
    if (!data) return false;
    this.progress = Store.merge(this.progress, data);
    write(PROGRESS_KEY, this.progress);
    return true;
  }
}

/** Keep whichever side actually answered each question. */
function mergeAnswers(a, b) {
  const left = a || [];
  const right = b || [];
  const len = Math.max(left.length, right.length);
  if (!len) return undefined;
  return Array.from({ length: len }, (_, i) =>
    Number.isInteger(left[i]) ? left[i] : Number.isInteger(right[i]) ? right[i] : null
  );
}

/** UTF-8 safe base64 helpers — the GitHub contents API speaks base64. */
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function describe(res) {
  let detail = "";
  try {
    const body = await res.json();
    detail = body.message || "";
  } catch { /* non-JSON error body */ }
  if (res.status === 401) return "GitHub rejected the token (401). Check that it hasn't expired.";
  if (res.status === 403) return "GitHub returned 403 — the token is missing Contents write access to this repo.";
  if (res.status === 404) return "Repo not found (404). Check the owner and repo name in Settings.";
  return `GitHub error ${res.status}${detail ? `: ${detail}` : ""}`;
}
