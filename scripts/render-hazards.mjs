#!/usr/bin/env node
/**
 * render-hazards.mjs
 *
 * Render the 5 SRD 5.2.1 hazard entries (Burning, Dehydration, Falling,
 * Malnutrition, Suffocation) from 5etools trapshazards.json to individual
 * markdown files in reference/srd/rules-glossary/rules-definitions/.
 *
 * These entries are from XPHB source and are listed in the SRD 5.2.1 Rules
 * Glossary (Appendix C) as [Hazard]-tagged entries. The 5etools srd52 flag
 * is not set on the individual hazard entries (a tagging gap), so we select
 * them by name. The parent "Hazard" glossary entry in variantrules.json IS
 * srd52-flagged and references this content.
 *
 * Usage:
 *   node scripts/render-hazards.mjs [--out <dir>]
 *
 * Options:
 *   --out <dir>   Output directory (default: reference/srd/rules-glossary/rules-definitions)
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
  ?? join(REPO_ROOT, "reference", "srd", "rules-glossary", "rules-definitions");
mkdirSync(outDir, { recursive: true });

// ── The 5 hazards confirmed in SRD 5.2.1 Appendix C ─────────────────────────
// Source: SRD_CC_v5.2.1.pdf Rules Glossary, [Hazard] entries.
// All are from XPHB; the srd52 flag is absent in 5etools (tagging gap).
const SRD_HAZARDS = new Set([
  "Burning",
  "Dehydration",
  "Falling",
  "Malnutrition",
  "Suffocation",
]);

// ── Tag stripping ─────────────────────────────────────────────────────────────
// Applied after RendererMarkdown renders the entry structure.
const TAG_RE = /\{@(\w+) ([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
function stripTags(s) {
  return String(s).replace(TAG_RE, (_, tag, content) => {
    const parts = content.split("|");
    if (["filter", "book", "adventure", "deck"].includes(tag)) return parts[0];
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
const raw     = JSON.parse(readFileSync(join(DATA, "trapshazards.json"), "utf8"));
const hazards = (raw.hazard ?? []).filter(
  h => SRD_HAZARDS.has(h.name) && h.source === "XPHB"
);

if (hazards.length !== SRD_HAZARDS.size) {
  const found = new Set(hazards.map(h => h.name));
  const missing = [...SRD_HAZARDS].filter(n => !found.has(n));
  console.warn(`Warning: expected ${SRD_HAZARDS.size} hazards, found ${hazards.length}. Missing: ${missing.join(", ")}`);
}

// Sort alphabetically for deterministic output
hazards.sort((a, b) => a.name.localeCompare(b.name));

// ── Render ────────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();
let written = 0;

for (const hazard of hazards) {
  const entryObj = { type: "section", name: hazard.name, entries: hazard.entries ?? [] };
  const md = stripTags(renderer.render(entryObj));
  const filename = `${slugify(hazard.name)}.md`;
  writeFileSync(join(outDir, filename), md, "utf8");
  console.log(`  wrote ${filename}`);
  written++;
}

console.log(`\nWrote ${written} hazards → ${outDir}`);
