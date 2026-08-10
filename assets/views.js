/** View rendering. Each view returns an HTML string; handlers bind after mount. */

import { renderMarkdown, escapeHtml, splitSections } from "./md.js";

const TICK = '<svg viewBox="0 0 12 12"><path d="M2 6.4 4.6 9 10 3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const KIND = { lesson: "read", build: "build", checkpoint: "checkpoint" };

function fmtMins(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h} hr`;
}

const fmtDate = (d) =>
  d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/* ── masthead ─────────────────────────────────────────── */

export function masthead(store) {
  const done = store.doneCount();
  const pct = Math.round((done / store.total) * 100);
  const streak = store.streak();
  const day = store.currentDay();
  const allDone = done === store.total;

  return `
    <header class="masthead">
      <div class="wrap masthead__inner">
        <a class="brand" href="#/">
          <span class="brand__mark">BM</span>
          <span class="brand__name">Backend Mastery</span>
        </a>
        <div class="gauges">
          <div class="gauge ${allDone ? "" : "gauge--hot"}">
            <div class="gauge__val">${allDone ? "45" : day}<em>/${store.total}</em></div>
            <div class="gauge__lbl">${allDone ? "complete" : "day"}</div>
          </div>
          <div class="gauge">
            <div class="gauge__val">${pct}<em>%</em></div>
            <div class="gauge__lbl">done</div>
          </div>
          <div class="gauge">
            <div class="gauge__val">${streak}</div>
            <div class="gauge__lbl">streak</div>
          </div>
        </div>
        <nav class="masthead__nav">
          <a class="iconbtn" href="#/settings" title="Settings" aria-label="Settings">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
          </a>
        </nav>
      </div>
      <div class="meter"><div class="meter__fill" style="width:${pct}%"></div></div>
    </header>`;
}

/* ── roadmap ──────────────────────────────────────────── */

export function roadmapView(store) {
  const next = store.nextModule();
  const done = store.doneCount();
  const pace = store.pace();
  const eta = store.etaDate();

  let paceLine = "";
  if (pace !== null && done > 0 && done < store.total) {
    if (pace >= 1) paceLine = `${pace} day${pace > 1 ? "s" : ""} ahead of pace`;
    else if (pace <= -1) paceLine = `${Math.abs(pace)} day${pace < -1 ? "s" : ""} behind pace`;
    else paceLine = "on pace";
  }

  const dispatch = next
    ? `
    <div class="dispatch rise-in" style="--i:2">
      <div class="dispatch__body">
        <div class="dispatch__kicker">Today · Day ${next.day} of ${store.total}</div>
        <h2 class="dispatch__title">${escapeHtml(next.title)}</h2>
        <p class="dispatch__sum">${escapeHtml(next.summary)}</p>
      </div>
      <a class="btn btn--go" href="#/module/${next.id}">Start · ${fmtMins(next.estMinutes)}</a>
    </div>`
    : `
    <div class="dispatch rise-in" style="--i:2">
      <div class="dispatch__body">
        <div class="dispatch__kicker">Expedition complete</div>
        <h2 class="dispatch__title">All ${store.total} modules done</h2>
        <p class="dispatch__sum">Every core module is behind you. The side quests are where the depth lives now.</p>
      </div>
      <a class="btn" href="#/module/${store.core[store.core.length - 1].id}">Revisit the last day</a>
    </div>`;

  const stats = [
    `${done}/${store.total} modules`,
    paceLine,
    done < store.total ? `${Math.round(store.minutesRemaining() / 60)} hrs left` : "",
    eta ? `finish ~${fmtDate(eta)}` : "",
  ].filter(Boolean);

  return `
    ${masthead(store)}
    <main class="wrap">
      <section class="brief">
        <div class="brief__eyebrow rise-in" style="--i:0">45 days · ${store.outline.phases.length} phases · one module a day</div>
        <h1 class="rise-in" style="--i:1">From mobile developer<br>to <em>backend engineer</em></h1>
        <p class="brief__lede rise-in" style="--i:1">${escapeHtml(store.outline.meta.description)}</p>
        ${dispatch}
        <p class="brief__stats rise-in" style="--i:3">${stats.map(escapeHtml).join(" &nbsp;·&nbsp; ")}</p>
      </section>
      <section class="trail">
        ${store.outline.phases.map((p, i) => camp(store, p, i)).join("")}
      </section>
    </main>`;
}

function camp(store, phase, index) {
  const quests = store.questsFor(phase.id);
  const coreDone = phase.modules.filter((m) => store.isDone(m.id)).length;
  const complete = coreDone === phase.modules.length;

  return `
    <section class="camp rise-in" style="--phase:${phase.color};--i:${4 + index}">
      <div class="camp__head">
        <div class="camp__num">${phase.num}</div>
        <div class="camp__meta">
          <h2 class="camp__title">${escapeHtml(phase.title)}</h2>
          <p class="camp__tag">${escapeHtml(phase.tagline)}</p>
        </div>
        <div class="camp__days">${complete ? "cleared" : escapeHtml(phase.days)}</div>
      </div>
      <ul class="legs">
        ${phase.modules.map((m) => leg(store, m, phase)).join("")}
        ${quests.length
          ? `<li class="quests__label">Side quests · optional</li>` + quests.map((q) => leg(store, q, phase, true)).join("")
          : ""}
      </ul>
    </section>`;
}

function leg(store, mod, phase, quest = false) {
  const done = store.isDone(mod.id);
  const unlocked = store.isUnlocked(mod.id);
  const isNext = !quest && store.nextModule()?.id === mod.id;

  const cls = ["leg"];
  if (quest) cls.push("leg--quest");
  if (done) cls.push("leg--done");
  else if (isNext) cls.push("leg--now");
  else if (unlocked) cls.push("leg--open");
  else cls.push("leg--locked");

  const dayLabel = quest ? "side quest" : `Day ${mod.day}`;
  const tags = [
    `<span class="chip chip--kind">${KIND[mod.type] || mod.type}</span>`,
    `<span class="chip chip--time">${fmtMins(mod.estMinutes)}</span>`,
    done ? `<span class="chip chip--done">done</span>` : "",
    mod.project ? `<span class="chip">${escapeHtml(mod.project)}</span>` : "",
  ].filter(Boolean).join("");

  const inner = `
    <span class="leg__pin">${done ? TICK : ""}</span>
    <span class="leg__row1">
      <span class="leg__day">${dayLabel}</span>
      <span class="leg__name">${escapeHtml(mod.title)}</span>
    </span>
    <p class="leg__sum">${escapeHtml(mod.summary)}</p>
    <span class="leg__tags">${tags}</span>`;

  if (!unlocked) {
    return `<li class="${cls.join(" ")}" style="--phase:${phase.color}">
      <div class="leg__card" title="Finish the earlier days to open this">${inner}</div>
    </li>`;
  }
  return `<li class="${cls.join(" ")}" style="--phase:${phase.color}">
    <a class="leg__card" href="#/module/${mod.id}">${inner}</a>
  </li>`;
}

/* ── module reader ────────────────────────────────────── */

export function moduleView(store, mod, content) {
  const phase = mod.phase;
  const state = store.state(mod.id) || {};
  const idx = store.core.findIndex((m) => m.id === mod.id);
  const prev = idx > 0 ? store.core[idx - 1] : null;
  const nextMod = idx >= 0 && idx < store.core.length - 1 ? store.core[idx + 1] : null;

  if (!content) {
    return `${masthead(store)}
      <main class="wrap reader" style="--phase:${phase.color}">
        <div class="reader__top"><a class="backlink" href="#/">← the trail</a></div>
        <div class="reader__head">
          <div class="reader__phase">${escapeHtml(phase.title)}</div>
          <h1 class="reader__title">${escapeHtml(mod.title)}</h1>
          <p class="reader__sum">${escapeHtml(mod.summary)}</p>
        </div>
        <div class="notice notice--warn">
          <strong>This module's content hasn't been written yet.</strong>
          Its lesson lives in <code>data/phases/content-${phase.id}.json</code> under the key <code>${mod.id}</code>.
        </div>
      </main>`;
  }

  const sections = splitSections(content.content);
  const bodyHtml = sections
    .map((s) => (s.title ? `<h2>${escapeHtml(s.title)}</h2>\n${renderMarkdown(s.body)}` : renderMarkdown(s.body)))
    .join("\n");

  const tasks = content.tasks || [];
  const checks = state.tasks || [];
  const quiz = content.quiz || [];
  const resources = content.resources || [];
  const done = store.isDone(mod.id);

  const tasksHtml = tasks.length
    ? `
    <section class="block">
      <div class="block__head"><span class="block__n">DO</span><h2 class="block__t">Work the module</h2></div>
      <p class="block__hint">Hands on keyboard. These are the reps — reading alone doesn't stick.</p>
      <ul class="tasks">
        ${tasks.map((t, i) => `
          <li>
            <label class="task">
              <input type="checkbox" data-task="${i}" ${checks[i] ? "checked" : ""}>
              <span class="task__box">${TICK}</span>
              <span class="task__label">${renderInlineOnly(t)}</span>
            </label>
          </li>`).join("")}
      </ul>
    </section>`
    : "";

  const quizHtml = quiz.length
    ? `
    <section class="block">
      <div class="block__head"><span class="block__n">CHECK</span><h2 class="block__t">Prove it stuck</h2></div>
      <p class="block__hint">Answer before you scroll back. Getting one wrong is more useful than guessing right.</p>
      <div class="quiz" id="quiz">
        ${quiz.map((q, qi) => {
          const picked = (state.quizAnswers || [])[qi];
          const settled = Number.isInteger(picked);
          return `
          <div class="q" data-q="${qi}">
            <p class="q__stem"><span>Q${qi + 1}</span>${renderInlineOnly(q.q)}</p>
            <div class="q__opts">
              ${q.options.map((o, oi) => {
                let cls = "opt";
                if (settled) {
                  if (oi === q.answer) cls += " opt--right";
                  else if (oi === picked) cls += " opt--wrong";
                }
                return `<button class="${cls}" data-q="${qi}" data-o="${oi}" ${settled ? "disabled" : ""}>
                  <span class="opt__k">${String.fromCharCode(65 + oi)}</span>
                  <span>${renderInlineOnly(o)}</span>
                </button>`;
              }).join("")}
            </div>
            <p class="q__why" ${settled ? "" : "hidden"}>${settled
              ? `<b>${picked === q.answer ? "Correct." : "Not quite."}</b> ${renderInlineOnly(q.explain)}`
              : ""}</p>
          </div>`;
        }).join("")}
      </div>
    </section>`
    : "";

  const trapHtml = content.trap
    ? `
    <div class="trap">
      <div class="trap__kicker">Deliberate trap</div>
      <h3 class="trap__title">${escapeHtml(content.trap.title)}</h3>
      <div class="prose">${renderMarkdown(content.trap.content)}</div>
    </div>`
    : "";

  const resourcesHtml = resources.length
    ? `
    <section class="block">
      <div class="block__head"><span class="block__n">REF</span><h2 class="block__t">Go deeper</h2></div>
      <ul class="links">
        ${resources.map((r) => {
          let host = "";
          try { host = new URL(r.url).hostname.replace(/^www\./, ""); } catch { host = ""; }
          return `<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">
            <span>${escapeHtml(r.label)}</span><small>${escapeHtml(host)}</small></a></li>`;
        }).join("")}
      </ul>
    </section>`
    : "";

  const answered = (state.quizAnswers || []).filter(Number.isInteger).length;
  const tasksLeft = tasks.length - checks.filter(Boolean).length;
  const ready = tasksLeft <= 0 && answered >= quiz.length;

  const stateLine = done
    ? `Completed <b>${new Date(state.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</b>`
    : ready
      ? `Ready to mark <b>day ${mod.day}</b> complete`
      : `<b>${Math.max(tasksLeft, 0)}</b> task${tasksLeft === 1 ? "" : "s"} left${quiz.length ? ` · quiz ${answered}/${quiz.length}` : ""}`;

  return `
    ${masthead(store)}
    <main class="wrap reader" style="--phase:${phase.color}">
      <div class="reader__top">
        <a class="backlink" href="#/">← the trail</a>
        <span class="chip">${escapeHtml(phase.days)}</span>
      </div>
      <div class="reader__head">
        <div class="reader__phase">Phase ${phase.num} · ${escapeHtml(phase.title)}</div>
        <h1 class="reader__title">${escapeHtml(mod.title)}</h1>
        <p class="reader__sum">${escapeHtml(mod.summary)}</p>
        <div class="reader__facts">
          <span class="chip chip--kind">${KIND[mod.type] || mod.type}</span>
          <span class="chip">${mod.optional ? "side quest" : `day ${mod.day}`}</span>
          <span class="chip">${fmtMins(mod.estMinutes)}</span>
          ${mod.project ? `<span class="chip">${escapeHtml(mod.project)}</span>` : ""}
        </div>
      </div>

      <article class="prose">${bodyHtml}</article>
      ${trapHtml}
      ${tasksHtml}
      ${quizHtml}
      ${resourcesHtml}

      <div class="finish ${done ? "finish--done" : ""}">
        <div class="finish__state" id="finish-state">${stateLine}</div>
        <div class="finish__row">
          ${done
            ? `<button class="btn btn--ghost" id="undo">Reopen this module</button>`
            : `<button class="btn btn--go" id="finish" ${ready ? "" : "disabled"}>Mark day ${mod.day} complete</button>
               ${ready ? "" : `<button class="btn btn--ghost" id="force">Complete anyway</button>`}`}
          ${nextMod && done ? `<a class="btn" href="#/module/${nextMod.id}">Next · ${escapeHtml(nextMod.title)}</a>` : ""}
        </div>
      </div>

      <nav class="pager">
        ${prev ? `<a href="#/module/${prev.id}"><small>← Day ${prev.day}</small><span>${escapeHtml(prev.title)}</span></a>` : "<span></span>"}
        ${nextMod ? `<a href="#/module/${nextMod.id}" style="text-align:right"><small>Day ${nextMod.day} →</small><span>${escapeHtml(nextMod.title)}</span></a>` : "<span></span>"}
      </nav>
    </main>`;
}

/** Escape, then allow only inline code/bold/links — used for tasks and quiz text. */
function renderInlineOnly(text) {
  const html = renderMarkdown(String(text));
  return html.replace(/^<p>/, "").replace(/<\/p>$/, "");
}

/* ── settings ─────────────────────────────────────────── */

export function settingsView(store) {
  const s = store.settings;
  const synced = s.lastSynced ? new Date(s.lastSynced).toLocaleString() : "never";
  const pagesUrl = `https://${s.owner || "your-name"}.github.io/${s.repo || "backend-mastery"}/`;

  return `
    ${masthead(store)}
    <main class="wrap panel">
      <div class="reader__top"><a class="backlink" href="#/">← the trail</a></div>
      <h1>Settings</h1>

      <div class="notice ${store.canSync ? "notice--ok" : ""}">
        <strong>${store.canSync ? "Sync is configured." : "Sync is off — progress is saved in this browser only."}</strong>
        Last synced: ${escapeHtml(synced)}.
        ${store.canSync ? "" : " Add a token below to push progress to GitHub so the daily alert knows where you are."}
      </div>

      <div class="field">
        <label for="token">GitHub token</label>
        <input type="password" id="token" value="${escapeHtml(s.token)}" placeholder="github_pat_..." autocomplete="off" spellcheck="false">
        <p class="field__note">
          A <strong>fine-grained</strong> personal access token with <code>Contents: Read and write</code> on
          <code>${escapeHtml(s.owner || "owner")}/${escapeHtml(s.repo || "repo")}</code> and nothing else.
          Stored only in this browser's localStorage and sent only to api.github.com — it is never committed.
        </p>
      </div>

      <div class="field row2">
        <div>
          <label for="owner">Repo owner</label>
          <input type="text" id="owner" value="${escapeHtml(s.owner)}" spellcheck="false">
        </div>
        <div>
          <label for="repo">Repo name</label>
          <input type="text" id="repo" value="${escapeHtml(s.repo)}" spellcheck="false">
        </div>
      </div>

      <div class="field">
        <label class="switch">
          <input type="checkbox" id="unlockAll" ${s.unlockAll ? "checked" : ""}>
          <span class="switch__track"></span>
          <span>Unlock every module</span>
        </label>
        <p class="field__note">Off by default so the path stays sequential. Turn it on to jump ahead or revisit anything.</p>
      </div>

      <div class="field">
        <div class="finish__row">
          <button class="btn btn--go" id="save">Save</button>
          <button class="btn" id="syncnow" ${store.canSync ? "" : "disabled"}>Sync now</button>
          <button class="btn btn--ghost" id="pullnow" ${store.canSync ? "" : "disabled"}>Pull from GitHub</button>
        </div>
      </div>

      <hr class="sep">

      <div class="field">
        <div class="field__legend">Backup</div>
        <div class="finish__row">
          <button class="btn" id="export">Download progress.json</button>
          <button class="btn btn--ghost" id="importbtn">Restore from file</button>
          <input type="file" id="importfile" accept="application/json,.json" hidden>
        </div>
        <p class="field__note">Works with or without a token — the same file the workflow reads.</p>
      </div>

      <hr class="sep">

      <div class="field">
        <div class="field__legend">Daily alert</div>
        <p class="field__note" style="margin-top:0">
          A GitHub Action runs every morning at 07:00 IST, reads <code>progress.json</code>, works out which day
          is due, and comments on the pinned <strong>Daily Plan</strong> issue with an @mention — which lands as a
          push notification if you have the GitHub mobile app installed. Set a repo variable named
          <code>NTFY_TOPIC</code> to also get an ntfy.sh push.
        </p>
        <p class="field__note">
          Site URL: <a href="${escapeHtml(pagesUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(pagesUrl)}</a>
        </p>
      </div>

      <hr class="sep">

      <div class="field">
        <div class="field__legend">Danger</div>
        <button class="btn btn--ghost" id="reset">Reset all local progress</button>
        <p class="field__note">Clears this browser's progress. If sync is on, pull from GitHub afterwards to restore.</p>
      </div>
    </main>`;
}
