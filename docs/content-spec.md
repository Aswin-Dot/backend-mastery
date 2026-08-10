# Content Spec — Backend Mastery module content

Lesson content for an interactive 45-day backend learning site built for **Aswin** — a senior React Native developer becoming a backend engineer and tech lead.

**What he already knows:** TypeScript, React Native, mobile app architecture, consuming REST APIs, git, shipping to app stores.
**What he doesn't:** servers, SQL, infrastructure, deployment.

**His context:** his company's app is a social app; its backend is Bun + Hono + Drizzle + Supabase Postgres with row-level security + pg-boss job queues on Railway. He also owns a second production backend built on NestJS. He has five practice projects (Express + Supabase + BullMQ) at `~/Documents/WorkFolder/SharedProjects/node+supabase/`: task-manager-api, chat-app-api, file-vault-api, marketplace-api, project-tracker-api.

`data/outline.json` is the source of truth for module ids, titles, summaries, day numbers, types, and time estimates. Read it first.

## Output format

Write ONE JSON file per phase at `data/phases/content-<phaseId>.json`:

```json
{
  "phaseId": "p0",
  "modules": {
    "m0-1": {
      "content": "<markdown string>",
      "tasks": ["<actionable checklist item>", "..."],
      "quiz": [
        { "q": "<question>", "options": ["a", "b", "c", "d"], "answer": 2, "explain": "<why>" }
      ],
      "resources": [ { "label": "<name>", "url": "https://..." } ],
      "trap": { "title": "<name>", "content": "<markdown>" }
    }
  }
}
```

- `trap` is OPTIONAL — include only where the module is about a failure mode you want him to experience deliberately.
- `quiz`: 3–5 questions, 4 options each, `answer` is the 0-based index, distractors must be plausible, `explain` teaches in 1–3 sentences.
- `tasks`: 3–7 concrete do-this items ("Write X", "Run Y and observe Z"), never vague ("understand X").
- `resources`: 2–5 REAL urls only — official docs (nodejs.org, expressjs.com, zod.dev, postgresql.org, supabase.com/docs, developer.mozilla.org, docs.nestjs.com, docs.bullmq.io, redis.io, docs.docker.com, docs.github.com, docs.aws.amazon.com, stripe.com/docs) or roadmap.sh tracks. **Never invent a URL.** Prefer stable top-level doc pages over deep anchors.

## Content style — this is the product, take it seriously

Every module's `content` follows this narrative arc, using these `##` headings exactly:

1. `## The problem` — open with a REAL story or scenario, 1–2 paragraphs. Prefer pain he'd recognize as a mobile dev (a screen that double-charges, a feed showing duplicate items, an upload that hangs at 99%, a 3am page) or an ops horror story. Name the symptom a user or developer actually sees.
2. `## The idea` — plain-English explanation with ONE strong analogy from his world (mobile dev, apps, everyday life). Never use jargon before defining it.
3. `## In practice` — concrete code. Short focused snippets with commentary between them, never one giant blob. TypeScript unless the topic is SQL/shell/config.
4. `## In your world` — 1–2 paragraphs connecting to his five practice projects and/or his work backend's patterns. This is where transfer actually happens; don't skip or pad it.
5. `## Watch out` — 2–4 bullet gotchas and misconceptions.

Checkpoint modules (`"type": "checkpoint"` in the outline) additionally end with `## Checkpoint` — 4–6 oral-exam-style questions he must answer cold, out loud, with no notes. These are NOT the quiz; they have no options and no answers listed. Model them on "what breaks if I delete this line?"

**Length:** 600–1000 words for core modules; 300–500 for side quests (they point into existing project guides rather than re-teaching).

**Voice:** direct, second person, warm but not fluffy. WHY before HOW. No filler openings ("In this module we will..."), no cheerleading, no em-dash-heavy AI cadence. Assume a smart peer who is new to this specific thing, not a beginner who is new to thinking.

## Markdown subset — the renderer supports ONLY this

`#`–`###` headings, paragraphs, `**bold**`, `*italic*`, `` `inline code` ``, fenced code blocks with a language tag (```ts, ```sql, ```bash, ```json), `-` lists, `1.` lists, `[text](url)`, `> blockquote`, `---` horizontal rule, and simple `|` tables with a `|---|` separator row.

NO html, NO images, NO nested lists, NO footnotes, NO task-list checkboxes.

## Hard rules

- **The JSON must parse and validate.** Run `node scripts/validate-content.mjs data/phases/<your-file>.json` and fix everything it reports before you finish.
- **Public-repo safety.** This repo will be public on GitHub. Never include company-internal URLs, secrets, environment values, or the specifics of any unfixed security issue in the work codebase. When referencing it, describe patterns generically ("a route that reaches for the privileged pool directly — your mentor will point you at a real instance"). Never name a vulnerable endpoint or file that contains a live vulnerability. Short idiomatic patterns (a `c.get("db")` call, a `createRoute` shape) are fine; proprietary code verbatim is not.
- **Re-teach, don't copy.** Source material named in your task is raw material. Extract and rewrite it in the style above. Never paste paragraphs wholesale.
- **roadmap.sh coverage.** Use the relevant roadmap.sh tracks (backend, devops, system-design, api-design, postgresql-dba, aws, backend-performance-best-practices, api-security-best-practices) as a mental checklist from your own knowledge of them — cover what he needs, skip what he doesn't, and link the track in resources where natural.
- **Reply with one line only:** file path, module count, validation status. Never paste the JSON into your reply.
