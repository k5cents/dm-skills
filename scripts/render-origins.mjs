#!/usr/bin/env node
/**
 * render-origins.mjs
 *
 * Render SRD backgrounds and species from 5etools JSON to markdown.
 * Outputs to <out>/backgrounds/ and <out>/species/.
 *
 * Usage:
 *   node scripts/render-origins.mjs [options]
 *
 * Options:
 *   --srd            Filter to srd52-flagged content only (SRD 5.2.1)
 *   --out <dir>      Output root (default: reference/srd/origins)
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

const outRoot = values.out ?? join(REPO_ROOT, "reference", "srd", "origins");
const bgDir   = join(outRoot, "backgrounds");
const spDir   = join(outRoot, "species");
mkdirSync(bgDir, { recursive: true });
mkdirSync(spDir, { recursive: true });

// ── Shared helpers ────────────────────────────────────────────────────────────
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

const renderer = RendererMarkdown.get();

function renderEntries(name, entries) {
  const md = renderer.render({ type: "section", name, entries: entries ?? [] });
  return stripTags(md);
}

// ── Backgrounds ───────────────────────────────────────────────────────────────
const bgData = JSON.parse(readFileSync(join(DATA, "backgrounds.json"), "utf8"));
let bgs = bgData.background ?? [];
if (values.srd) bgs = bgs.filter(b => b.srd52 && b.source === "XPHB");
bgs.sort((a, b) => a.name.localeCompare(b.name));

for (const bg of bgs) {
  const md = renderEntries(bg.name, bg.entries);
  writeFileSync(join(bgDir, `${slugify(bg.name)}.md`), md, "utf8");
}
console.log(`Wrote ${bgs.length} backgrounds → ${bgDir}`);

// ── Species ───────────────────────────────────────────────────────────────────
const SIZE_NAMES = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };

function fmtSpeed(speed) {
  if (typeof speed === "number") return `${speed} ft.`;
  return Object.entries(speed)
    .map(([k, v]) => k === "walk" ? `${v} ft.` : `${v} ft. (${k})`)
    .join(", ");
}

function fmtSizes(sizes) {
  return sizes.map(s => SIZE_NAMES[s] ?? s).join(" or ");
}

const raceData = JSON.parse(readFileSync(join(DATA, "races.json"), "utf8"));
let species = raceData.race ?? [];
if (values.srd) species = species.filter(r => r.srd52 && r.source === "XPHB");
species.sort((a, b) => a.name.localeCompare(b.name));

for (const sp of species) {
  // Stat summary as a list-hang-notitle (renders as bolded name:value list)
  const typeStr = (sp.creatureTypes ?? ["humanoid"]).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(", ");
  const spdStr  = sp.speed !== undefined ? fmtSpeed(sp.speed) : "30 ft.";

  const statItems = [
    { type: "item", name: "Creature Type:", entry: typeStr },
  ];
  // Prefer sizeEntry prose over raw size codes
  if (sp.sizeEntry) {
    statItems.push(sp.sizeEntry);
  } else if (sp.size) {
    statItems.push({ type: "item", name: "Size:", entry: fmtSizes(sp.size) });
  }
  statItems.push({ type: "item", name: "Speed:", entry: spdStr });
  if (sp.darkvision) statItems.push({ type: "item", name: "Darkvision:", entry: `${sp.darkvision} ft.` });

  const statBlock = { type: "list", style: "list-hang-notitle", items: statItems };
  const bodyEntries = [statBlock, ...(sp.entries ?? [])];
  const sectionMd = renderEntries(sp.name, bodyEntries);
  writeFileSync(join(spDir, `${slugify(sp.name)}.md`), sectionMd, "utf8");
}
console.log(`Wrote ${species.length} species → ${spDir}`);
