#!/usr/bin/env node
/**
 * render-entry.mjs
 *
 * Render the description of a spell or item from the database to markdown,
 * using 5etools' RendererMarkdown (the same engine that renders book chapters).
 *
 * Usage:
 *   node scripts/render-entry.mjs --spell "Fireball"
 *   node scripts/render-entry.mjs --spell "Fireball" --source XPHB
 *   node scripts/render-entry.mjs --item "Sending Stones"
 *   node scripts/render-entry.mjs --item "Blast Disk (Common)" --source ExploringEberron24
 *
 * Flags:
 *   --tags    Preserve cross-reference tags ({@condition}, {@spell}, {@item},
 *             {@scaledamage}, {@creature}, {@action}) in the output. All other
 *             tags are stripped to plain text as normal. Useful for rules
 *             adjudication — these tags signal mechanically-defined terms that
 *             an LLM or rules skill can follow up on.
 */

import { DatabaseSync } from "node:sqlite";
import { parseArgs }    from "util";
import path             from "path";

// ── Paths ─────────────────────────────────────────────────────────────────────
// Repo root is one level up from scripts/. External repos default to siblings
// of this repo but can be overridden via the FIVETOOLS_SRC env var.
const REPO_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TOOLS_SRC = process.env.FIVETOOLS_SRC
  ?? path.join(path.dirname(REPO_ROOT), "5etools-src");
const TOOLS_JS  = `file://${TOOLS_SRC}/js`;
const DB_DIR    = `${REPO_ROOT}/databases`;

// ── 5etools renderer ──────────────────────────────────────────────────────────
for (const mod of ["parser.js", "utils.js", "utils-config.js", "hist.js", "render.js", "render-markdown.js"]) {
  await import(`${TOOLS_JS}/${mod}`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    spell:  { type: "string"  },
    item:   { type: "string"  },
    source: { type: "string"  },
    tags:   { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (!values.spell && !values.item) {
  console.error("Usage: node render-entry.mjs --spell <name> | --item <name> [--source <SOURCE>] [--tags]");
  process.exit(1);
}

// ── Tag processing ────────────────────────────────────────────────────────────

// Tags whose full {@tag content} syntax is semantically meaningful for an LLM:
// - They signal a mechanically-defined term that can be looked up or cross-referenced.
// - {@scaledamage} encodes the base+scaling formula; the clean render drops the base.
const KEEP_TAGS = new Set([
  "condition",   // {@condition blinded} → blinded is a defined condition
  "disease",     // {@disease filth fever}
  "status",      // {@status concentration}
  "spell",       // {@spell fireball} → cross-ref to another spell
  "item",        // {@item longsword} → cross-ref to an item
  "scaledamage", // {@scaledamage 8d6|3-9|1d6} → full scaling formula
  "creature",    // {@creature goblin} → cross-ref to a stat block
  "action",      // {@action dodge} → a defined game action
]);

/**
 * Extract the display text from a stripped tag's content.
 * 5etools convention: last pipe segment when 3+ parts, first segment otherwise.
 *   {@damage 8d6}                              → "8d6"
 *   {@hazard burning|XPHB}                     → "burning"
 *   {@variantrule Sphere [AoE]|XPHB|Sphere}    → "Sphere"
 *   {@b bold text}                             → "bold text"
 */
function tagDisplayText(content) {
  const parts = content.split("|");
  return parts.length >= 3 ? parts[parts.length - 1] : parts[0];
}

/**
 * Walk the entries structure recursively. In string values, either:
 *   - preserve KEEP_TAGS as placeholder tokens (swapped back after rendering), or
 *   - strip other tags to their display text.
 * Returns { processed: mutated entries, restore: Map<placeholder → original tag> }.
 */
function prepareEntries(obj, keepTags) {
  const restore = new Map();
  let counter = 0;

  // Regex: matches {@tagName content-up-to-closing-brace}
  // Handles nested braces one level deep (e.g. {@variantrule Foo [Bar]|src|Foo})
  const TAG_RE = /\{@(\w+) ([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;

  function processString(str) {
    return str.replace(TAG_RE, (match, tag, content) => {
      if (keepTags.has(tag)) {
        const ph = `REPH${counter++}`;
        restore.set(ph, match);
        return ph;
      }
      return tagDisplayText(content);
    });
  }

  function walk(node) {
    if (typeof node === "string") return processString(node);
    if (Array.isArray(node))     return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  }

  return { processed: walk(obj), restore };
}

/**
 * After RendererMarkdown renders the processed entries, swap placeholders back
 * to their original {@tag content} form.
 */
function restoreTags(markdown, restore) {
  let out = markdown;
  for (const [ph, original] of restore) {
    // Use a literal string replace (not regex) since placeholders have no special chars
    out = out.split(ph).join(original);
  }
  return out;
}

// ── Query ─────────────────────────────────────────────────────────────────────
const isSpell = Boolean(values.spell);
const name    = values.spell ?? values.item;
const dbFile  = isSpell ? `${DB_DIR}/spells.db` : `${DB_DIR}/items.db`;

const db = new DatabaseSync(dbFile);

let row;
if (values.source) {
  row = db.prepare(`SELECT * FROM ${isSpell ? "spells" : "items"} WHERE name = ? AND source = ?`)
          .get(name, values.source);
} else {
  // Prefer XPHB > PHB > anything else for spells; XDMG > DMG for items
  const preferOrder = isSpell
    ? ["XPHB", "PHB", "TCE", "XGE", "EFA", "ExploringEberron24"]
    : ["XDMG", "DMG", "TCE", "ERLW", "EFA", "ExploringEberron24", "FoEQuickstone"];

  const rows = db.prepare(`SELECT * FROM ${isSpell ? "spells" : "items"} WHERE name = ?`)
                 .all(name);

  if (!rows.length) {
    console.error(`Not found: "${name}"`);
    process.exit(1);
  }
  // Sort by preferOrder rank so XPHB beats PHB, XDMG beats DMG, etc.
  row = [...rows]
    .sort((a, b) => {
      const ai = preferOrder.indexOf(a.source);
      const bi = preferOrder.indexOf(b.source);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    })[0];
}

db.close();

if (!row) {
  console.error(`Not found: "${name}"${values.source ? ` in source ${values.source}` : ""}`);
  process.exit(1);
}

// ── Render ────────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();

let entries     = JSON.parse(row.entries_json   || "[]");
let higherLevel = isSpell ? JSON.parse(row.higher_level_json || "[]") : [];

// In --tags mode: replace keep-tags with placeholders before rendering,
// restore them after. Strip all other tags to plain text.
let restore = new Map();
if (values.tags) {
  let restoreHL;
  ({ processed: entries,     restore }            = prepareEntries(entries,     KEEP_TAGS));
  ({ processed: higherLevel, restore: restoreHL } = prepareEntries(higherLevel, KEEP_TAGS));
  for (const [k, v] of restoreHL) restore.set(k, v);
}

// ── Header ────────────────────────────────────────────────────────────────────
const lines = [];

if (isSpell) {
  lines.push(`# ${row.name}`);
  lines.push(`*${row.school} ${row.level === 0 ? "cantrip" : `level ${row.level} spell`} — ${row.source}*`);
  lines.push("");

  const components = [row.verbal   ? "V" : null,
                      row.somatic  ? "S" : null,
                      row.material ? "M" : null].filter(Boolean).join(", ");

  lines.push(`**Casting Time:** ${row.casting_time}${row.ritual ? " (ritual)" : ""}`);
  lines.push(`**Range:** ${row.range}`);
  lines.push(`**Components:** ${components}`);
  lines.push(`**Duration:** ${row.duration}${row.concentration ? " *(concentration)*" : ""}`);
  lines.push("");
} else {
  lines.push(`# ${row.name}`);
  const typeStr = [row.type, row.rarity && row.rarity !== "none" ? row.rarity : null]
    .filter(Boolean).join(", ");
  lines.push(`*${typeStr}${row.attunement ? ` (requires attunement${row.attunement_req ? " " + row.attunement_req : ""})` : ""} — ${row.source}*`);
  lines.push("");
}

// ── Body ──────────────────────────────────────────────────────────────────────
function renderSection(entryList, name = row.name) {
  if (!entryList.length) return "";
  let md = renderer.render({ type: "entries", name, entries: entryList });
  md = md.replace(/^###[^\n]+\n\n?/, "").trim(); // strip redundant name heading
  if (values.tags) md = restoreTags(md, restore);
  return md;
}

const body  = renderSection(entries);
const upper = renderSection(higherLevel, "");

if (body)  lines.push(body);
if (upper) { lines.push(""); lines.push(upper); }

console.log(lines.join("\n"));
