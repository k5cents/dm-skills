#!/usr/bin/env node
/**
 * render-monsters.mjs
 *
 * Render SRD 5.2.1 monsters from 5etools bestiary JSON to individual markdown
 * stat block files, using the built-in RendererMarkdown.monster renderer.
 *
 * Usage:
 *   node scripts/render-monsters.mjs [options]
 *
 * Options:
 *   --srd            Filter to srd52-flagged monsters only (SRD 5.2.1)
 *   --out <dir>      Output directory (default: reference/srd/monsters)
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { parseArgs } from "util";

const REPO_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TOOLS_SRC = process.env.FIVETOOLS_SRC
  ?? join(dirname(REPO_ROOT), "5etools-src");
const TOOLS_JS     = `file://${TOOLS_SRC}/js`;
const BESTIARY_DIR = join(TOOLS_SRC, "data", "bestiary");

for (const mod of ["parser.js", "utils.js", "utils-config.js", "utils-brew.js", "hist.js", "render.js", "render-markdown.js"]) {
  await import(`${TOOLS_JS}/${mod}`);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    srd:     { type: "boolean", default: false },
    "non-srd": { type: "boolean", default: false },
    out:     { type: "string" },
  },
});

const outDir = values.out ?? join(REPO_ROOT, "reference", "srd", "monsters");
mkdirSync(outDir, { recursive: true });

// Stub browser-only utilities that are used by the stat block renderer
globalThis.UiUtil = {
  intToBonus: (n, { isPretty = false } = {}) =>
    `${n >= 0 ? "+" : n < 0 ? (isPretty ? "−" : "-") : ""}${Math.abs(n)}`,
};

// DataLoader stub — default returns null.
// When --srd is set (committed reference content), legendary group data is suppressed:
// lair actions and regional effects from legendarygroups.json carry no srd52 flag
// and do not appear in the SRD 5.2.1 PDF.
// When rendering locally (statblocks/), the cache is populated for full detail.
globalThis.DataLoader = { getFromCache: () => null };

// Ensure "one" (2024) style — it is the default but set explicitly for safety
VetoolsConfig.set("styleSwitcher", "style", "one");

// ── Helpers ───────────────────────────────────────────────────────────────────
const TAG_RE = /\{@(\w+) ([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
function stripTags(s) {
  return String(s).replace(TAG_RE, (_, tag, content) => {
    const parts = content.split("|");
    if (["filter", "book", "adventure", "deck", "table"].includes(tag)) return parts[0];
    if (["i", "b", "italic", "bold"].includes(tag)) return parts[0];
    return parts.length >= 3 ? parts[parts.length - 1] : parts[0];
  });
}

function slugify(name) {
  return name.toLowerCase().replace(/[''""]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ── Load monsters ─────────────────────────────────────────────────────────────
const bestiaryFiles = readdirSync(BESTIARY_DIR)
  .filter(f => f.match(/^bestiary-[a-z]/));

let allMonsters = [];
for (const f of bestiaryFiles) {
  const d = JSON.parse(readFileSync(join(BESTIARY_DIR, f), "utf8"));
  allMonsters.push(...(d.monster ?? []));
}

if (values.srd) allMonsters = allMonsters.filter(m => m.srd52);
if (values["non-srd"]) allMonsters = allMonsters.filter(m => !m.srd52);
allMonsters.sort((a, b) => a.name.localeCompare(b.name));

// When not restricting to SRD, populate DataLoader with legendary group data so
// full stat blocks (lair actions, regional effects) are rendered for local use.
if (!values.srd) {
  const lgData = JSON.parse(readFileSync(join(BESTIARY_DIR, "legendarygroups.json"), "utf8"));
  const lgCache = new Map();
  for (const g of lgData.legendaryGroup ?? []) {
    const hash = UrlUtil.encodeArrayForHash(g.name, g.source);
    lgCache.set(`legendaryGroup\0${g.source}\0${hash}`, g);
  }
  DataLoader.getFromCache = (prop, source, hash) => lgCache.get(`${prop}\0${source}\0${hash}`) ?? null;
}

// When not restricting to SRD, load fluff for habitat/lore/tables appended after ---
const fluffLookup = new Map();
if (!values.srd) {
  for (const f of bestiaryFiles) {
    const fluffFile = join(BESTIARY_DIR, f.replace("bestiary-", "fluff-bestiary-"));
    try {
      const d = JSON.parse(readFileSync(fluffFile, "utf8"));
      for (const fl of (d.monsterFluff ?? [])) {
        fluffLookup.set(`${fl.name}|${fl.source}`, fl);
      }
    } catch { /* no fluff file for this source */ }
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();
const slugsSeen = new Map();

for (const mon of allMonsters) {
  // meta must be pre-initialized; _typeStack is required by _recursiveRender
  const statBlock = RendererMarkdown.monster.getCompactRenderedString(mon, { meta: { _typeStack: [] } }).trim();

  let fluffMd = "";
  const fluff = fluffLookup.get(`${mon.name}|${mon.source}`);
  if (fluff?.entries?.length) {
    renderer.setFirstSection(true);
    fluffMd = "\n\n---\n\n" + stripTags(fluff.entries.map(e => renderer.render(e)).join("\n\n").trim());
  }

  const md = statBlock + fluffMd + "\n";

  // Deduplicate slugs (e.g. two monsters named "Skeleton" from different sources)
  let slug = slugify(mon.name);
  if (slugsSeen.has(slug)) {
    slugsSeen.set(slug, slugsSeen.get(slug) + 1);
    slug = `${slug}-${slugsSeen.get(slug)}`;
  } else {
    slugsSeen.set(slug, 1);
  }

  writeFileSync(join(outDir, `${slug}.md`), md, "utf8");
}

console.log(`Wrote ${allMonsters.length} monsters → ${outDir}`);
