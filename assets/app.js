/** Router, boot, and event wiring. */

import { Store } from "./store.js";
import { roadmapView, moduleView, settingsView } from "./views.js";

const root = document.getElementById("app");
const contentCache = new Map();
let store = null;

/* ── helpers ──────────────────────────────────────────── */

function toast(message, kind = "") {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = `toast ${kind ? `toast--${kind}` : ""}`;
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 4200);
}

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

async function phaseContent(phaseId) {
  if (contentCache.has(phaseId)) return contentCache.get(phaseId);
  let data = null;
  try {
    data = await loadJson(`data/phases/content-${phaseId}.json`);
  } catch {
    data = { modules: {} }; // content not written yet — the view says so
  }
  contentCache.set(phaseId, data);
  return data;
}

/** Push progress in the background; never block the UI on the network. */
function syncQuietly(message) {
  if (!store.canSync) return;
  store.sync(message).catch((err) => toast(err.message, "bad"));
}

/* ── views ────────────────────────────────────────────── */

function mount(html, { scroll = true } = {}) {
  root.innerHTML = html;
  if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
}

function showRoadmap() {
  document.title = "Backend Mastery — 45-Day Expedition";
  mount(roadmapView(store));
}

async function showModule(id) {
  const mod = store.get(id);
  if (!mod) return showRoadmap();

  if (!store.isUnlocked(id)) {
    toast(`Day ${mod.day} is still locked — finish the earlier days first, or unlock everything in Settings.`);
    // Correct the URL too, so a refresh doesn't land back on the locked module.
    if (location.hash !== "#/") location.hash = "#/";
    else showRoadmap();
    return;
  }

  const pack = await phaseContent(mod.phase.id);
  const content = pack.modules?.[id] || null;

  document.title = `${mod.title} — Backend Mastery`;
  mount(moduleView(store, mod, content));
  if (content) wireModule(mod, content);
}

function showSettings() {
  document.title = "Settings — Backend Mastery";
  mount(settingsView(store));
  wireSettings();
}

/* ── module interactions ──────────────────────────────── */

function wireModule(mod, content) {
  const tasks = content.tasks || [];
  const quiz = content.quiz || [];
  const answerKey = quiz.map((q) => q.answer);

  const refreshFinish = () => {
    const state = store.state(mod.id) || {};
    const checks = state.tasks || [];
    const answered = (state.quizAnswers || []).filter(Number.isInteger).length;
    const left = tasks.length - checks.filter(Boolean).length;
    const ready = left <= 0 && answered >= quiz.length;

    const line = document.getElementById("finish-state");
    const btn = document.getElementById("finish");
    const force = document.getElementById("force");

    if (line && !store.isDone(mod.id)) {
      line.innerHTML = ready
        ? `Ready to mark <b>day ${mod.day}</b> complete`
        : `<b>${Math.max(left, 0)}</b> task${left === 1 ? "" : "s"} left${quiz.length ? ` · quiz ${answered}/${quiz.length}` : ""}`;
    }
    if (btn) btn.disabled = !ready;
    if (force && ready) force.remove();
  };

  root.querySelectorAll('input[data-task]').forEach((box) => {
    box.addEventListener("change", () => {
      const checks = Array.from(root.querySelectorAll('input[data-task]')).map((b) => b.checked);
      store.setTasks(mod.id, checks);
      refreshFinish();
    });
  });

  root.querySelectorAll(".opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const qi = Number(btn.dataset.q);
      const oi = Number(btn.dataset.o);
      const q = quiz[qi];
      const card = root.querySelector(`.q[data-q="${qi}"]`);
      if (!q || !card || card.dataset.settled) return;
      card.dataset.settled = "1";

      store.setQuizAnswer(mod.id, qi, oi, answerKey);

      card.querySelectorAll(".opt").forEach((o) => {
        const idx = Number(o.dataset.o);
        o.disabled = true;
        if (idx === q.answer) o.classList.add("opt--right");
        else if (idx === oi) o.classList.add("opt--wrong");
      });

      const why = card.querySelector(".q__why");
      why.innerHTML = `<b>${oi === q.answer ? "Correct." : "Not quite."}</b> ${escapeText(q.explain)}`;
      why.hidden = false;
      refreshFinish();
    });
  });

  const finish = (opts = {}) => {
    store.complete(mod.id);
    const label = opts.forced ? " (self-attested)" : "";
    syncQuietly(`progress: day ${mod.day} — ${mod.title}${label}`);
    const next = store.core.find((m) => !store.isDone(m.id));
    toast(next ? `Day ${mod.day} logged. Next up: ${next.title}` : "That was the last one. All 45 days complete.", "ok");
    showModule(mod.id);
  };

  document.getElementById("finish")?.addEventListener("click", () => finish());
  document.getElementById("force")?.addEventListener("click", () => finish({ forced: true }));
  document.getElementById("undo")?.addEventListener("click", () => {
    store.uncomplete(mod.id);
    syncQuietly(`progress: reopened day ${mod.day} — ${mod.title}`);
    showModule(mod.id);
  });
}

function escapeText(s) {
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

/* ── settings interactions ────────────────────────────── */

function wireSettings() {
  const val = (id) => document.getElementById(id).value.trim();

  document.getElementById("save").addEventListener("click", () => {
    store.saveSettings({
      token: val("token"),
      owner: val("owner"),
      repo: val("repo"),
      unlockAll: document.getElementById("unlockAll").checked,
    });
    store.setStartDate(val("startsOn"));
    toast("Saved.", "ok");
    showSettings();
  });

  document.getElementById("unlockAll").addEventListener("change", (e) => {
    store.saveSettings({ unlockAll: e.target.checked });
  });

  document.getElementById("syncnow").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await store.sync("progress: manual sync");
      toast("Pushed to GitHub.", "ok");
      showSettings();
    } catch (err) {
      toast(err.message, "bad");
      e.target.disabled = false;
    }
  });

  document.getElementById("pullnow").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const found = await store.pull();
      toast(found ? "Pulled and merged from GitHub." : "No progress.json in the repo yet.", found ? "ok" : "");
      showSettings();
    } catch (err) {
      toast(err.message, "bad");
      e.target.disabled = false;
    }
  });

  document.getElementById("export").addEventListener("click", () => {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "progress.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const file = document.getElementById("importfile");
  document.getElementById("importbtn").addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      store.importJson(await f.text());
      toast("Progress restored.", "ok");
      showSettings();
    } catch (err) {
      toast(`Could not read that file — ${err.message}`, "bad");
    }
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("Clear all local progress? If sync is on you can pull it back from GitHub.")) return;
    store.importJson('{"version":1,"modules":{}}');
    toast("Local progress cleared.");
    showSettings();
  });
}

/* ── routing ──────────────────────────────────────────── */

function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const moduleMatch = hash.match(/^\/module\/([\w.-]+)$/);
  if (moduleMatch) return showModule(moduleMatch[1]);
  if (hash === "/settings") return showSettings();
  return showRoadmap();
}

/* ── boot ─────────────────────────────────────────────── */

(async function boot() {
  try {
    const outline = await loadJson("data/outline.json");
    store = new Store(outline);
  } catch (err) {
    root.innerHTML = `<main class="wrap panel"><h1>Could not start</h1>
      <div class="notice notice--bad"><strong>${escapeText(err.message)}</strong>
      This site must be served over HTTP — opening index.html from the filesystem blocks fetch().
      Run <code>python3 -m http.server 8080</code> in the repo and open localhost:8080.</div></main>`;
    return;
  }

  window.addEventListener("hashchange", route);
  route();

  // Reconcile with the repo in the background so another device's progress shows up.
  if (store.canSync) {
    store
      .pull()
      .then((found) => { if (found) route(); })
      .catch(() => { /* offline or bad token — Settings surfaces it on demand */ });
  }
})();
