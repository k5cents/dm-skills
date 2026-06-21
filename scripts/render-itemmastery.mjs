#!/usr/bin/env node
/**
 * render-itemmastery.mjs
 *
 * Render SRD 5.2.1 weapon mastery property definitions to individual markdown
 * files in reference/srd/equipment/mastery/.
 *
 * Source: items-base.json — 8 itemMastery entries with srd52: true (all XPHB):
 *   Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex
 *
 * Usage:
 *   node scripts/render-itemmastery.mjs [--out <dir>]
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { parseArgs } from "util";

// ── Paths ─────────────────────────────────────────────────────────────────────
const REPO_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TOOLS_SRC = process.env.FIVETOOLS_SRC
  ?? join(dirname(REPO_ROOT), "5etools-src");
const TOOLS_JS  = `file://${TOOLS_SRC}/js`;
const DATA      = join(TOOLS_SRC, "data");

// ── 5etools renderer ──────────────────────────────────────────────────────────
for (const mod of ["parser.js", "utils.js", "utils-config.js", "hist.js", "render.js", "render-markdown.js"]) {
  await import(`${TOOLS_JS}/${mod}`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    out: { type: "string" },
  },
});

const outDir = values.out
  ?? join(REPO_ROOT, "reference", "srd", "equipment", "mastery");
mkdirSync(outDir, { recursive: true });

// ── Tag stripping ─────────────────────────────────────────────────────────────
const TAG_RE = /\{@(\w+) ([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
function stripTags(s) {
  return String(s).replace(TAG_RE, (_, tag, content) => {
    const parts = content.split("|");
    if (["filter", "book", "adventure", "deck", "note"].includes(tag)) return parts[0];
    return parts.length >= 3 ? parts[parts.length - 1] : parts[0];
  });
}

// ── Slug helper ───────────────────────────────────────────────────────────────
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[''""]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Load and filter ───────────────────────────────────────────────────────────
const raw      = JSON.parse(readFileSync(join(DATA, "items-base.json"), "utf8"));
const masteries = (raw.itemMastery ?? [])
  .filter(m => m.srd52)
  .sort((a, b) => a.name.localeCompare(b.name));

// ── Render ────────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();
let written = 0;

for (const mastery of masteries) {
  const entryObj = { type: "section", name: mastery.name, entries: mastery.entries ?? [] };
  const md = stripTags(renderer.render(entryObj));
  const filename = `${slugify(mastery.name)}.md`;
  writeFileSync(join(outDir, filename), md, "utf8");
  console.log(`  wrote ${filename}`);
  written++;
}

console.log(`\nWrote ${written} mastery properties → ${outDir}`);
