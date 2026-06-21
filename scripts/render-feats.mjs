#!/usr/bin/env node
/**
 * render-feats.mjs
 *
 * Render SRD feats from 5etools feats.json to individual markdown files.
 *
 * Usage:
 *   node scripts/render-feats.mjs [options]
 *
 * Options:
 *   --srd            Filter to srd52-flagged feats only (SRD 5.2.1)
 *   --out <dir>      Output directory (default: reference/srd/feats)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { parseArgs } from "util";

const REPO_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TOOLS_SRC = process.env.FIVETOOLS_SRC
  ?? join(dirname(REPO_ROOT), "5etools-src");
const TOOLS_JS  = `file://${TOOLS_SRC}/js`;
const DATA      = join(TOOLS_SRC, "data");

for (const mod of ["parser.js", "utils.js", "utils-config.js", "hist.js", "render.js", "render-markdown.js"]) {
  await import(`${TOOLS_JS}/${mod}`);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    srd: { type: "boolean", default: false },
    out: { type: "string" },
  },
});

const outDir = values.out ?? join(REPO_ROOT, "reference", "srd", "feats");
mkdirSync(outDir, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
const TAG_RE = /\{@(\w+) ([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
function stripTags(s) {
  return String(s).replace(TAG_RE, (_, tag, content) => {
    const parts = content.split("|");
    if (["filter", "book", "adventure", "deck"].includes(tag)) return parts[0];
    return parts.length >= 3 ? parts[parts.length - 1] : parts[0];
  });
}

function slugify(name) {
  return name.toLowerCase().replace(/[''""]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const CATEGORIES = { O: "Origin", G: "General", FS: "Fighting Style", EB: "Epic Boon" };
const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

function fmtPrereq(prereqs) {
  if (!prereqs?.length) return null;
  return prereqs.map(p => {
    const parts = [];
    if (p.level) parts.push(`Level ${p.level}`);
    if (p.ability) {
      const abParts = p.ability.map(ab => {
        return Object.entries(ab).map(([k, v]) => `${ABILITY_NAMES[k] ?? k} ${v}`).join(" or ");
      });
      parts.push(abParts.join(" or "));
    }
    if (p.proficiency) parts.push("proficiency with " + p.proficiency.map(pr => Object.keys(pr)[0]).join(" or "));
    if (p.spell) parts.push("the " + p.spell.join(" or ") + " spell");
    return parts.join(", ");
  }).join(", or ");
}

const renderer = RendererMarkdown.get();

// ── Load and filter ───────────────────────────────────────────────────────────
const raw   = JSON.parse(readFileSync(join(DATA, "feats.json"), "utf8"));
let   feats = raw.feat ?? [];
if (values.srd) feats = feats.filter(f => f.srd52);
feats.sort((a, b) => a.name.localeCompare(b.name));

// ── Render ────────────────────────────────────────────────────────────────────
for (const feat of feats) {
  const catName = CATEGORIES[feat.category] ?? feat.category ?? "General";
  const prereq  = fmtPrereq(feat.prerequisite);
  const tagLine = prereq
    ? `*${catName} Feat — Prerequisite: ${prereq}*`
    : `*${catName} Feat*`;

  // Build entries: insert the italic tag line before the feat description
  const entries = [tagLine, ...(feat.entries ?? [])];
  const md = stripTags(renderer.render({ type: "section", name: feat.name, entries }));
  writeFileSync(join(outDir, `${slugify(feat.name)}.md`), md, "utf8");
}

console.log(`Wrote ${feats.length} feats → ${outDir}`);
