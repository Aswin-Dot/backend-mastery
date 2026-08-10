#!/usr/bin/env node
// Validates a phase content JSON file against the outline and content rules.
// Usage: node scripts/validate-content.mjs data/phases/content-p0.json [...more]
// With no args, validates every content-*.json in data/phases/ and checks
// that all outline modules are covered across the set.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outline = JSON.parse(readFileSync(join(root, "data/outline.json"), "utf8"));

const allIds = new Map();
for (const ph of outline.phases) for (const m of ph.modules) allIds.set(m.id, ph.id);
for (const sq of outline.sideQuests) allIds.set(sq.id, sq.phase);

const errors = [];
const covered = new Set();

function validateFile(path) {
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    errors.push(`${path}: JSON PARSE FAILED — ${e.message}`);
    return;
  }
  if (!data.modules || typeof data.modules !== "object") {
    errors.push(`${path}: missing "modules" object`);
    return;
  }
  for (const [id, mod] of Object.entries(data.modules)) {
    const where = `${path} → ${id}`;
    if (!allIds.has(id)) errors.push(`${where}: id not present in outline.json`);
    covered.add(id);
    if (typeof mod.content !== "string" || mod.content.length < 400)
      errors.push(`${where}: content missing or too short (<400 chars)`);
    if (/<[a-z]+[\s>]/i.test(mod.content || ""))
      errors.push(`${where}: content appears to contain raw HTML`);
    if (!Array.isArray(mod.tasks) || mod.tasks.length < 2)
      errors.push(`${where}: needs >=2 tasks`);
    if (!Array.isArray(mod.quiz) || mod.quiz.length < 2)
      errors.push(`${where}: needs >=2 quiz questions`);
    for (const [i, q] of (mod.quiz || []).entries()) {
      if (!q.q || !Array.isArray(q.options) || q.options.length < 2)
        errors.push(`${where}: quiz[${i}] malformed`);
      else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length)
        errors.push(`${where}: quiz[${i}].answer out of range`);
      if (!q.explain) errors.push(`${where}: quiz[${i}] missing explain`);
    }
    if (!Array.isArray(mod.resources) || mod.resources.length < 1)
      errors.push(`${where}: needs >=1 resource`);
    for (const [i, r] of (mod.resources || []).entries()) {
      if (!r.label || !/^https:\/\//.test(r.url || ""))
        errors.push(`${where}: resources[${i}] needs label + https url`);
    }
    if (mod.trap && (!mod.trap.title || !mod.trap.content))
      errors.push(`${where}: trap needs title + content`);
  }
}

const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync(join(root, "data/phases"))
      .filter((f) => f.startsWith("content-") && f.endsWith(".json"))
      .map((f) => join(root, "data/phases", f));

for (const f of files) validateFile(f);

if (!args.length) {
  for (const id of allIds.keys())
    if (!covered.has(id)) errors.push(`COVERAGE: ${id} has no content in any file`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${files.length} file(s) valid, ${covered.size} module(s) checked`);
