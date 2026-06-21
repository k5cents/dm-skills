#!/usr/bin/env node
/**
 * render-magic-items.mjs
 *
 * Render SRD magic items from 5etools items.json to individual markdown files.
 *
 * Usage:
 *   node scripts/render-magic-items.mjs [options]
 *
 * Options:
 *   --srd            Filter to srd52-flagged items only (SRD 5.2.1)
 *   --out <dir>      Output directory (default: reference/srd/magic-items)
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

const outDir = values.out ?? join(REPO_ROOT, "reference", "srd", "magic-items");
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

// Strip "|SOURCE" suffix from type codes (e.g. "WD|XDMG" → "WD")
function stripSrc(code) {
  return (code ?? "").split("|")[0];
}

const ITEM_TYPES = {
  WD: "Wand", ST: "Staff", RD: "Rod", RG: "Ring", P: "Potion", SC: "Scroll",
  M: "Weapon", R: "Weapon", A: "Ammunition", HA: "Armor", MA: "Armor", LA: "Armor",
  S: "Shield", G: "Adventuring Gear", OTH: "Wondrous Item", "$A": "Wondrous Item",
  INS: "Instrument", AT: "Artisan's Tools", FD: "Food and Drink",
};

function fmtType(item) {
  const t = stripSrc(item.type);
  if (item.wondrous) return "Wondrous Item";
  if (item.wand)     return "Wand";
  if (item.staff)    return "Staff";
  if (item.rod)      return "Rod";
  if (item.ring)     return "Ring";
  if (item.armor)    return "Armor";
  if (item.weapon || item.sword || item.axe || item.bow || item.crossbow) return "Weapon";
  return ITEM_TYPES[t] ?? "Wondrous Item";
}

function fmtSubtitle(item) {
  const type   = fmtType(item);
  const rarity = item.rarity ? item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1) : null;
  const attune = item.reqAttune
    ? (typeof item.reqAttune === "string" ? `requires attunement ${item.reqAttune}` : "requires attunement")
    : null;
  const parts = [type, rarity].filter(Boolean).join(", ");
  return attune ? `*${parts} (${attune})*` : `*${parts}*`;
}

// ── Load and filter ───────────────────────────────────────────────────────────
const raw   = JSON.parse(readFileSync(join(DATA, "items.json"), "utf8"));
let   items = raw.item ?? [];
if (values.srd) items = items.filter(i => i.srd52);
items.sort((a, b) => a.name.localeCompare(b.name));

// ── Render ────────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();
const usedSlugs = new Map();

for (const item of items) {
  let slug = slugify(item.name);
  // Deduplicate slugs (e.g. "+1 Weapon", "+2 Weapon" all start with weapon variants)
  if (usedSlugs.has(slug)) {
    let n = 2;
    while (usedSlugs.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  usedSlugs.set(slug, true);

  const subtitle = fmtSubtitle(item);
  const entries  = [subtitle, ...(item.entries ?? [])];
  const md = stripTags(renderer.render({ type: "section", name: item.name, entries }));
  writeFileSync(join(outDir, `${slug}.md`), md, "utf8");
}

console.log(`Wrote ${items.length} magic items → ${outDir}`);
