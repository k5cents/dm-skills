#!/usr/bin/env node
/**
 * render-variantrules.mjs
 *
 * Render 5etools variantrule entries to individual markdown files.
 * Used to populate reference/srd/rules-glossary/rules-definitions/.
 *
 * Usage:
 *   node scripts/render-variantrules.mjs [options]
 *
 * Options:
 *   --srd            Filter to srd52-flagged rules only (SRD 5.2.1)
 *   --source <src>   Source filter (default: no filter)
 *   --out <dir>      Output directory (default: reference/srd/rules-glossary/rules-definitions)
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
    srd:    { type: "boolean", default: false },
    source: { type: "string"  },
    out:    { type: "string"  },
  },
});

const outDir = values.out
  ?? join(REPO_ROOT, "reference", "srd", "rules-glossary", "rules-definitions");
mkdirSync(outDir, { recursive: true });

// ── Tag stripping ─────────────────────────────────────────────────────────────
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
const raw   = JSON.parse(readFileSync(join(DATA, "variantrules.json"), "utf8"));
let   rules = raw.variantrule ?? [];
if (values.srd)    rules = rules.filter(r => r.srd52);
if (values.source) rules = rules.filter(r => r.source === values.source);

// Sort alphabetically (the JSON is already sorted but make it explicit)
rules.sort((a, b) => a.name.localeCompare(b.name));

// ── Render ───────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();
let written = 0;

for (const rule of rules) {
  const entryObj = { type: "section", name: rule.name, entries: rule.entries ?? [] };
  const md = stripTags(renderer.render(entryObj));
  const filename = `${slugify(rule.name)}.md`;
  writeFileSync(join(outDir, filename), md, "utf8");
  written++;
}

console.log(`Wrote ${written} rules → ${outDir}`);
