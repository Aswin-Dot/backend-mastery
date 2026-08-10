# Backend Mastery — 45-Day Expedition

An interactive learning site that takes a mobile developer from "I've only ever *called* APIs" to shipping production backend work — in 45 days, one module a day, 1–2 hours an evening.

Built for one person, on purpose. The examples assume you already know React Native and TypeScript, so nothing explains what a variable is; and every module ties back to either one of five hands-on practice projects or a real production codebase.

**→ [Open the site](https://aswin-dot.github.io/backend-mastery/)**

---

## The path

| Phase | Days | Modules | Hours | Side quests | Focus |
|---|---|---|---|---|---|
| **0. Foundations** | 1–6 | 6 | 7.5 | 1 | The backend mental model — from `fetch()` to a layered server |
| **1. The Data Layer** | 7–10 | 4 | 5.0 | 1 | SQL, PostgreSQL, and what Supabase actually is |
| **2. Project 1: Task Manager** | 11–14 | 4 | 6.0 | — | Your first real API — auth, schema, RLS, services |
| **3. Real-time, Jobs & Files** | 15–20 | 6 | 8.8 | 2 | The concepts behind every chat screen, upload, and background task |
| **4. Production Data Patterns** | 21–27 | 7 | 9.8 | 3 | Money, search, caching, RBAC — plus API design and security done right |
| **5. NestJS** | 28–29 | 2 | 3.0 | 1 | The opinionated framework — DI, modules, guards, DTOs |
| **6. The Real Codebase** | 30–36 | 7 | 9.8 | 1 | Bun, Hono, Drizzle, RLS pools, twin job queues — and your first PRs |
| **7. DevOps & AWS** | 37–42 | 6 | 9.0 | 2 | Docker, CI/CD, observability, incident response, the AWS you actually need |
| **8. System Design & Mastery** | 43–45 | 3 | 4.5 | 2 | Design the systems you've been building — then prove it all |

**45 core modules · ~63 hours · 13 optional side quests** (another ~40 hours of depth for anything you want to go deeper on).

Modules unlock in sequence, so there's exactly one thing to do on any given evening. Side quests branch off each phase and never block the path — they're where the full project builds, Stripe, AWS deployment, and load testing live.

### How a module works

Each one follows the same shape, because the shape is the pedagogy:

1. **The problem** — a real scenario. A screen that double-charges. A feed showing duplicate items. A 3am page. You should recognize the symptom before you learn the fix.
2. **The idea** — plain English, one strong analogy, no jargon before it's defined.
3. **In practice** — code you can actually run.
4. **In your world** — how it maps onto your own projects and codebase.
5. **Watch out** — the gotchas.

Then a task checklist, a quiz with explanations, and links to the real documentation.

Some modules add a **deliberate trap**: build the naive version, break it on purpose, and see the failure mode with your own eyes. Enqueue a job on the wrong queue and watch it silently never run. Rename a response field and watch the mobile client get `undefined` with nothing in the logs. The traps are the curriculum; the working version is just the vehicle.

Phase-ending modules are **checkpoints** — a handful of questions to answer out loud, cold, with no notes. "Point at any line and tell me what breaks if I delete it" is the standard.

---

## Progress tracking

Progress lives in `localStorage` and, when a token is configured, syncs to `progress.json` in this repo — so it follows you across devices and the daily alert knows where you are.

**Setting up sync:**

1. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
2. Scope it to **this repository only**, with **Contents: Read and write**. Nothing else.
3. Open **Settings** on the site and paste it in.

The token is stored only in your browser and sent only to `api.github.com`. It is never committed and never logged. Checking off a module commits an updated `progress.json`; if you complete something on another device first, the two are merged rather than overwritten.

No token? Progress still works locally, and **Settings → Backup** exports the same `progress.json` you can commit by hand.

---

## Daily alert

`.github/workflows/daily-plan.yml` runs every morning at **07:00 IST**, reads `progress.json`, works out which day is due, and comments on the pinned **Daily Plan** issue with a link straight to it.

The comment @mentions you, which is what makes GitHub notify you — install the GitHub mobile app and it arrives as a push. It also tells you when you've slipped behind the one-a-day pace, and nudges harder after two quiet days.

**Optional phone push via [ntfy](https://ntfy.sh):** set a repository variable named `NTFY_TOPIC` to a private topic name and subscribe to it in the ntfy app.

Test it any time from the Actions tab — **Daily plan → Run workflow**, with the dry-run box checked to print without posting.

---

## Local development

No build step, no dependencies. It's ES modules, hand-written CSS, and JSON.

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>. (Opening `index.html` directly won't work — `fetch()` is blocked on `file://`.)

```
index.html                    shell
assets/app.js                 router + boot
assets/views.js               roadmap, module reader, settings
assets/store.js               progress state, derived stats, GitHub sync
assets/md.js                  markdown renderer (escape-first, no HTML passthrough)
assets/app.css               the whole design system
data/outline.json             the curriculum — single source of truth
data/phases/content-*.json    module content, one file per phase
scripts/daily-plan.mjs        the daily notifier
scripts/validate-content.mjs  content linter
docs/content-spec.md          the style contract every module follows
```

**Validate content** after editing any phase file:

```bash
node scripts/validate-content.mjs
```

It checks JSON shape, quiz answer ranges, that every resource URL is `https`, that no raw HTML leaked into the markdown, and that every module in `outline.json` has content.

**Preview a day's alert** without posting:

```bash
DRY_RUN=1 GITHUB_REPOSITORY=aswin-dot/backend-mastery node scripts/daily-plan.mjs
```

---

## Adding or editing content

`data/outline.json` defines the path — phases, day numbers, titles, time estimates. `data/phases/content-<phaseId>.json` holds the actual lessons, keyed by module id. Both are plain JSON with no build step, so a typo fix is a one-line commit.

If you write new modules, follow [`docs/content-spec.md`](docs/content-spec.md) — it's the contract that keeps every module readable in the same voice, and the validator enforces the mechanical half of it.

---

## License

MIT. The curriculum structure and site are free to reuse; if you fork it for your own ramp, the content spec is the part worth copying.
