#!/usr/bin/env node
/**
 * render-spells.mjs
 *
 * Render SRD spells from 5etools spell JSON to individual markdown files.
 *
 * Usage:
 *   node scripts/render-spells.mjs [options]
 *
 * Options:
 *   --srd            Filter to srd52-flagged spells only (SRD 5.2.1)
 *   --out <dir>      Output directory (default: reference/srd/spells)
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { parseArgs } from "util";

const REPO_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TOOLS_SRC = process.env.FIVETOOLS_SRC
  ?? join(dirname(REPO_ROOT), "5etools-src");
const TOOLS_JS   = `file://${TOOLS_SRC}/js`;
const SPELL_DIR  = join(TOOLS_SRC, "data", "spells");

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

const outDir = values.out ?? join(REPO_ROOT, "reference", "srd", "spells");
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

const SCHOOLS = { A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", I: "Illusion", N: "Necromancy", T: "Transmutation", V: "Evocation" };

function fmtLevel(level) {
  if (level === 0) return "Cantrip";
  const suffixes = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  return `${suffixes[level] ?? level + "th"}-level`;
}

function fmtTime(time) {
  if (!time?.length) return "—";
  const t = time[0];
  const unit = t.unit === "bonus action" ? "Bonus Action"
    : t.unit === "reaction" ? "Reaction"
    : t.unit.charAt(0).toUpperCase() + t.unit.slice(1);
  const base = t.number === 1 ? unit : `${t.number} ${unit}s`;
  return t.condition ? `${base}, ${t.condition}` : base;
}

function fmtRange(range) {
  if (!range) return "—";
  if (range.type === "self") return "Self";
  if (range.type === "touch") return "Touch";
  if (range.type === "sight") return "Sight";
  if (range.type === "unlimited") return "Unlimited";
  const d = range.distance;
  if (!d) return range.type;
  if (d.type === "touch")  return "Touch";
  if (d.type === "feet")   return `${d.amount} feet`;
  if (d.type === "miles") return `${d.amount} mile${d.amount !== 1 ? "s" : ""}`;
  return `${d.amount} ${d.type}`;
}

function fmtComponents(comp) {
  if (!comp) return "—";
  const parts = [];
  if (comp.v) parts.push("V");
  if (comp.s) parts.push("S");
  if (comp.m) parts.push(typeof comp.m === "string" ? `M (${comp.m})` : "M");
  if (comp.r) parts.push("R");
  return parts.join(", ");
}

function fmtDuration(dur) {
  if (!dur?.length) return "—";
  const d = dur[0];
  if (d.type === "instant")    return "Instantaneous";
  if (d.type === "permanent")  return "Until dispelled";
  if (d.type === "special")    return "Special";
  if (d.type === "timed") {
    const td  = d.duration;
    const amt = td.amount ?? 1;
    const u   = td.type.charAt(0).toUpperCase() + td.type.slice(1);
    const str = `${amt} ${u}${amt !== 1 ? "s" : ""}`;
    return d.concentration ? `Concentration, up to ${str}` : str;
  }
  return d.type;
}

// ── Load all spell files ──────────────────────────────────────────────────────
const spellFiles = readdirSync(SPELL_DIR).filter(f => f.match(/^spells-[a-z]/));
let allSpells = [];
for (const f of spellFiles) {
  const d = JSON.parse(readFileSync(join(SPELL_DIR, f), "utf8"));
  allSpells.push(...(d.spell ?? []));
}

if (values.srd) allSpells = allSpells.filter(s => s.srd52);
allSpells.sort((a, b) => a.name.localeCompare(b.name));

// ── Render ────────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();

for (const sp of allSpells) {
  const school    = SCHOOLS[sp.school] ?? sp.school ?? "—";
  const levelStr  = fmtLevel(sp.level);
  const subtitle  = sp.level === 0 ? `*${school} Cantrip*` : `*${levelStr} ${school}*`;

  const statBlock = [
    `**Casting Time:** ${fmtTime(sp.time)}`,
    `**Range:** ${fmtRange(sp.range)}`,
    `**Components:** ${fmtComponents(sp.components)}`,
    `**Duration:** ${fmtDuration(sp.duration)}`,
  ];

  const entries = [subtitle, ...statBlock, ...(sp.entries ?? [])];
  if (sp.entriesHigherLevel?.length) {
    entries.push(...sp.entriesHigherLevel);
  }

  const md = stripTags(renderer.render({ type: "section", name: sp.name, entries }));
  writeFileSync(join(outDir, `${slugify(sp.name)}.md`), md, "utf8");
}

console.log(`Wrote ${allSpells.length} spells → ${outDir}`);
