#!/usr/bin/env node
/**
 * render-class.mjs
 *
 * Render a D&D class from 5etools class JSON to markdown.
 *
 * Usage:
 *   node scripts/render-class.mjs <ClassName> [options]
 *   node scripts/render-class.mjs Barbarian
 *   node scripts/render-class.mjs Wizard --srd
 *   node scripts/render-class.mjs Cleric --srd --out reference/srd/classes/cleric.md
 *
 * Options:
 *   --srd            Filter to srd52-flagged content only
 *   --source <src>   Source edition (default: XPHB)
 *   --out <file>     Write output to file instead of stdout
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, join, dirname }      from "path";
import { parseArgs }                   from "util";

// ── Paths ─────────────────────────────────────────────────────────────────────
const REPO_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TOOLS_SRC = process.env.FIVETOOLS_SRC
  ?? join(dirname(REPO_ROOT), "5etools-src");
const TOOLS_JS  = `file://${TOOLS_SRC}/js`;
const CLASS_DIR = join(TOOLS_SRC, "data", "class");

// ── 5etools renderer ──────────────────────────────────────────────────────────
for (const mod of ["parser.js", "utils.js", "utils-config.js", "hist.js", "render.js", "render-markdown.js"]) {
  await import(`${TOOLS_JS}/${mod}`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    srd:    { type: "boolean", default: false },
    source: { type: "string",  default: "XPHB" },
    out:    { type: "string"  },
  },
  allowPositionals: true,
});

const className = positionals[0];
if (!className) {
  console.error("Usage: node scripts/render-class.mjs <ClassName> [--srd] [--source XPHB] [--out <file>]");
  process.exit(1);
}

const SOURCE   = values.source;
const SRD_ONLY = values.srd;

// ── Load class JSON ───────────────────────────────────────────────────────────
const classFile = resolve(join(CLASS_DIR, `class-${className.toLowerCase()}.json`));
let data;
try {
  data = JSON.parse(readFileSync(classFile, "utf8"));
} catch (e) {
  console.error(`Failed to load ${classFile}: ${e.message}`);
  process.exit(1);
}

const classEntry = data.class.find(c =>
  c.source === SOURCE && c.name.toLowerCase() === className.toLowerCase()
);
if (!classEntry) {
  const avail = data.class.map(c => `${c.name} (${c.source})`).join(", ");
  console.error(`"${className}" not found in source ${SOURCE}. Available: ${avail}`);
  process.exit(1);
}

// ── Tag stripping ─────────────────────────────────────────────────────────────
// {@ filter} / {@ book}: first segment is always the display text.
// Everything else: 3+ pipe-segments → last segment, otherwise first.
const TAG_RE = /\{@(\w+) ([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
function stripTags(s) {
  return String(s).replace(TAG_RE, (_, tag, content) => {
    const parts = content.split("|");
    if (["filter", "book", "adventure", "deck"].includes(tag)) return parts[0];
    return parts.length >= 3 ? parts[parts.length - 1] : parts[0];
  });
}

// ── Feature lookup maps ───────────────────────────────────────────────────────
// classFeatureMap:    "FeatureName|Level"                → feature object
// subclassFeatureMap: "SubclassShortName|FeatureName|Level" → feature object
function buildClassFeatureMap(features, src, srdOnly) {
  const map = new Map();
  for (const f of features ?? []) {
    if (f.source !== src) continue;
    if (srdOnly && !f.srd52) continue;
    const key = `${f.name}|${f.level}`;
    if (!map.has(key)) map.set(key, f);
  }
  return map;
}

function buildSubclassFeatureMap(features, src, srdOnly) {
  const map = new Map();
  for (const f of features ?? []) {
    if (f.source !== src) continue;
    if (srdOnly && !f.srd52) continue;
    const key = `${f.subclassShortName}|${f.name}|${f.level}`;
    if (!map.has(key)) map.set(key, f);
  }
  return map;
}

const classFeatureMap    = buildClassFeatureMap(data.classFeature, SOURCE, SRD_ONLY);
const subclassFeatureMap = buildSubclassFeatureMap(data.subclassFeature, SOURCE, SRD_ONLY);

// ── Ref resolution ────────────────────────────────────────────────────────────
// Recursively replace ref* entries with their resolved content.
// refSubclassFeature in subclass opener entries are skipped (rendered separately
// as ### Level N headings below the opener).
function resolveRefs(entries, { skipSubclassRefs = false } = {}) {
  const out = [];
  for (const e of entries ?? []) {
    if (typeof e === "string") { out.push(e); continue; }
    if (!e || typeof e !== "object") continue;

    switch (e.type) {
      case "refClassFeature": {
        const parts = (e.classFeature ?? "").split("|");
        const feat  = classFeatureMap.get(`${parts[0]}|${parseInt(parts[3])}`);
        if (feat) {
          out.push({ type: "entries", name: feat.name,
            entries: resolveRefs(feat.entries, { skipSubclassRefs }) });
        }
        break;
      }
      case "refSubclassFeature": {
        if (skipSubclassRefs) break;
        // "Name|Class|Src|SubclassShort|SubclassSrc|Level"
        const parts = (e.subclassFeature ?? "").split("|");
        const feat  = subclassFeatureMap.get(`${parts[3]}|${parts[0]}|${parseInt(parts[5])}`);
        if (feat) {
          out.push({ type: "entries", name: feat.name,
            entries: resolveRefs(feat.entries, { skipSubclassRefs }) });
        }
        break;
      }
      case "refFeat": {
        // Just name the feat option — don't inline full feat text
        const name = stripTags((e.feat ?? "").split("|")[0]);
        if (name) out.push(`*Fighting Style option: ${name}*`);
        break;
      }
      case "refOptionalfeature": {
        // List the optional feature name inline
        const name = stripTags((e.optionalfeature ?? "").split("|")[0]);
        if (name) out.push({ type: "item", name, entries: [] });
        break;
      }
      default:
        // Recurse into any entry that has sub-entries
        if (e.entries) {
          out.push({ ...e, entries: resolveRefs(e.entries, { skipSubclassRefs }) });
        } else {
          out.push(e);
        }
    }
  }
  return out;
}

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();

// Render a feature's entries array without adding a top-level heading.
// The renderer wraps everything in an "entries" section that produces a ###
// heading — we strip that and keep sub-headings at ####+.
function renderBody(entries, opts = {}) {
  const resolved = resolveRefs(entries, opts);
  if (!resolved.length) return "";
  const md = renderer.render({ type: "entries", name: "\x00", entries: resolved });
  return md.replace(/^#{1,6}\s*\x00[^\n]*\n\n?/, "").trimEnd();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function profBonus(level) {
  return `+${Math.ceil(level / 4) + 1}`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function capitalize(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function cellStr(cell) {
  if (cell == null)             return "—";
  if (typeof cell === "number") return String(cell);
  if (typeof cell === "string") return stripTags(cell) || "—";
  if (cell.type === "bonus")       return `+${cell.value}`;
  if (cell.type === "bonusSpeed")  return `+${cell.value} ft.`;
  if (cell.type === "dice")
    return cell.toRoll.map(d => `${d.number}d${d.faces}`).join("+");
  return "—";
}

function mdTable(labels, rows) {
  const sep  = labels.map(() => "---");
  return [
    "| " + labels.join(" | ") + " |",
    "| " + sep.join(" | ")   + " |",
    ...rows.map(r => "| " + r.join(" | ") + " |"),
  ].join("\n");
}

// ── Spell slot tables ─────────────────────────────────────────────────────────
// The 5etools JSON stores spell slot rows as empty arrays for full/half casters
// (the site computes them client-side). We embed the standard tables here.

// Standard full-caster spell slots (Bard, Cleric, Druid, Sorcerer, Wizard)
const FULL_CASTER_SLOTS = [
  [2,0,0,0,0,0,0,0,0],
  [3,0,0,0,0,0,0,0,0],
  [4,2,0,0,0,0,0,0,0],
  [4,3,0,0,0,0,0,0,0],
  [4,3,2,0,0,0,0,0,0],
  [4,3,3,0,0,0,0,0,0],
  [4,3,3,1,0,0,0,0,0],
  [4,3,3,2,0,0,0,0,0],
  [4,3,3,3,1,0,0,0,0],
  [4,3,3,3,2,0,0,0,0],
  [4,3,3,3,2,1,0,0,0],
  [4,3,3,3,2,1,0,0,0],
  [4,3,3,3,2,1,1,0,0],
  [4,3,3,3,2,1,1,0,0],
  [4,3,3,3,2,1,1,1,0],
  [4,3,3,3,2,1,1,1,0],
  [4,3,3,3,2,1,1,1,1],
  [4,3,3,3,3,1,1,1,1],
  [4,3,3,3,3,2,1,1,1],
  [4,3,3,3,3,2,2,1,1],
];

// Half-caster spell slots (Paladin, Ranger — "artificer" progression in 5etools)
const HALF_CASTER_SLOTS = [
  [2,0,0,0,0],
  [2,0,0,0,0],
  [3,0,0,0,0],
  [3,0,0,0,0],
  [4,2,0,0,0],
  [4,2,0,0,0],
  [4,3,0,0,0],
  [4,3,0,0,0],
  [4,3,2,0,0],
  [4,3,2,0,0],
  [4,3,3,0,0],
  [4,3,3,0,0],
  [4,3,3,1,0],
  [4,3,3,1,0],
  [4,3,3,2,0],
  [4,3,3,2,0],
  [4,3,3,3,1],
  [4,3,3,3,1],
  [4,3,3,3,2],
  [4,3,3,3,2],
];

const SPELL_SLOT_COLS_FULL = ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th"];
const SPELL_SLOT_COLS_HALF = ["1st","2nd","3rd","4th","5th"];

// ── Progression table ─────────────────────────────────────────────────────────
// Collect feature names per level from the ordered classFeatures reference list.
const featuresByLevel = new Map();
for (let i = 1; i <= 20; i++) featuresByLevel.set(i, []);

for (const ref of classEntry.classFeatures ?? []) {
  let fname, level;
  if (typeof ref === "string") {
    const p = ref.split("|"); fname = p[0]; level = parseInt(p[3]);
  } else if (ref.classFeature) {
    const p = ref.classFeature.split("|"); fname = p[0]; level = parseInt(p[3]);
  }
  if (!fname || !level) continue;
  if (SRD_ONLY && !classFeatureMap.has(`${fname}|${level}`)) continue;
  featuresByLevel.get(level)?.push(fname);
}

// classTableGroups: skip any group whose rows array is empty (server-computed).
const casterProg = classEntry.casterProgression;
const tableGroups = (classEntry.classTableGroups ?? []).filter(g => (g.rows?.length ?? 0) > 0);
const extraLabels = tableGroups.flatMap(g =>
  (g.colLabels ?? []).map(h => stripTags(String(h)))
);

// Build the 20-row main table.
const allColLabels = ["Level", "PB", "Features", ...extraLabels];
const mainRows = [];
for (let lvl = 1; lvl <= 20; lvl++) {
  const features  = featuresByLevel.get(lvl)?.join(", ") || "—";
  const extraCells = tableGroups.flatMap(g =>
    ((g.rows ?? [])[lvl - 1] ?? []).map(cellStr)
  );
  mainRows.push([ordinal(lvl), profBonus(lvl), features, ...extraCells]);
}

// ── Starting info ─────────────────────────────────────────────────────────────
const sp = classEntry.startingProficiencies ?? {};

function listProfs(arr) {
  if (!arr?.length) return "None";
  return arr.map(p => {
    if (typeof p === "string") return capitalize(stripTags(p));
    if (p.choose) {
      const from = p.choose.from.map(s => capitalize(stripTags(s))).join(", ");
      return `Choose ${p.choose.count ?? 1} from: ${from}`;
    }
    return JSON.stringify(p);
  }).join("; ");
}

const saveProfs  = (classEntry.proficiency ?? []).map(s => capitalize(s)).join(", ");
const skillProfs = listProfs(sp.skills);
const armorProfs = listProfs(sp.armor);
const weaponProfs = listProfs(sp.weapons);
const toolProfs  = listProfs(sp.tools);
const hd         = classEntry.hd;
const hdStr      = hd ? `d${hd.faces}` : "—";
const primaryAb  = (classEntry.primaryAbility ?? [])
  .map(a => Object.keys(a).map(capitalize).join(" or ")).join(", ");
const startEquip = (classEntry.startingEquipment?.entries ?? [])
  .map(e => stripTags(String(e))).join("\n\n");

// Multiclassing
const mc        = classEntry.multiclassing ?? {};
const mcReqs    = mc.requirements
  ? Object.entries(mc.requirements).map(([k, v]) => `${capitalize(k)} ${v}`).join(", ")
  : null;
const mcProfParts = [];
if (mc.proficienciesGained?.armor?.length)
  mcProfParts.push("Armor: " + listProfs(mc.proficienciesGained.armor));
if (mc.proficienciesGained?.weapons?.length)
  mcProfParts.push("Weapons: " + listProfs(mc.proficienciesGained.weapons));
if (mc.proficienciesGained?.skills?.length)
  mcProfParts.push("Skills: " + listProfs(mc.proficienciesGained.skills));
const mcProfs = mcProfParts.join("; ") || null;

// ── Assemble output ───────────────────────────────────────────────────────────
const out = [];

out.push(`# ${classEntry.name}`);
out.push("");
out.push(`*Primary Ability: ${primaryAb}*`);
out.push("");
out.push(`**Hit Point Die:** ${hdStr} per ${classEntry.name} level`);
out.push(`**Saving Throw Proficiencies:** ${saveProfs}`);
out.push(`**Skill Proficiencies:** ${skillProfs}`);
out.push(`**Armor Training:** ${armorProfs}`);
out.push(`**Weapon Proficiencies:** ${weaponProfs}`);
if (toolProfs && toolProfs !== "None")
  out.push(`**Tool Proficiencies:** ${toolProfs}`);
out.push("");

if (startEquip) {
  out.push("## Starting Equipment");
  out.push("");
  out.push(startEquip);
  out.push("");
}

if (mcReqs || mcProfs) {
  out.push("## Multiclassing");
  out.push("");
  if (mcReqs)  out.push(`**Prerequisite:** ${mcReqs}`);
  if (mcProfs) out.push(`**Proficiencies Gained:** ${mcProfs}`);
  out.push("");
}

// Main features table
out.push(`## ${classEntry.name} Features`);
out.push("");
out.push(mdTable(allColLabels, mainRows));
out.push("");

// Spell slot table (full or half casters whose slot rows are server-computed)
if (casterProg === "full") {
  out.push("### Spell Slots");
  out.push("");
  out.push(mdTable(
    ["Level", ...SPELL_SLOT_COLS_FULL],
    FULL_CASTER_SLOTS.map((row, i) => [ordinal(i + 1), ...row.map(String)])
  ));
  out.push("");
} else if (casterProg === "artificer") {
  out.push("### Spell Slots");
  out.push("");
  out.push(mdTable(
    ["Level", ...SPELL_SLOT_COLS_HALF],
    HALF_CASTER_SLOTS.map((row, i) => [ordinal(i + 1), ...row.map(String)])
  ));
  out.push("");
}

// ── Class features ────────────────────────────────────────────────────────────
const rendered = new Set();

for (const ref of classEntry.classFeatures ?? []) {
  let fname, level;
  if (typeof ref === "string") {
    const p = ref.split("|"); fname = p[0]; level = parseInt(p[3]);
  } else if (ref.classFeature) {
    const p = ref.classFeature.split("|"); fname = p[0]; level = parseInt(p[3]);
  }
  if (!fname || !level) continue;

  const key  = `${fname}|${level}`;
  const feat = classFeatureMap.get(key);
  if (!feat || rendered.has(key)) continue;
  rendered.add(key);

  const body = renderBody(feat.entries ?? []);
  out.push(`## Level ${level}: ${feat.name}`);
  out.push("");
  if (body) { out.push(body); out.push(""); }
}

// ── Subclasses ────────────────────────────────────────────────────────────────
const subclasses = (data.subclass ?? []).filter(sc =>
  sc.source === SOURCE &&
  sc.className.toLowerCase() === className.toLowerCase() &&
  (!SRD_ONLY || sc.srd52)
);

for (const sc of subclasses) {
  const scShort = sc.shortName;

  // The subclass opener feature shares its name with the subclass itself.
  // It contains the flavor intro + refSubclassFeature refs (which we skip here
  // since each referenced feature is rendered separately as a ### heading).
  const openerKey  = `${scShort}|${sc.name}|3`;
  const openerFeat = subclassFeatureMap.get(openerKey);

  out.push(`## ${sc.name}`);
  out.push("");

  if (openerFeat) {
    const body = renderBody(openerFeat.entries ?? [], { skipSubclassRefs: true });
    if (body) { out.push(body); out.push(""); }
  }

  // All subclass features except the opener, in level order.
  const scFeats = [...subclassFeatureMap.entries()]
    .filter(([k]) => k.startsWith(`${scShort}|`))
    .map(([, f]) => f)
    .filter(f => !(f.name === sc.name && f.level === 3))
    .sort((a, b) => a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name));

  for (const sf of scFeats) {
    const body = renderBody(sf.entries ?? []);
    out.push(`### Level ${sf.level}: ${sf.name}`);
    out.push("");
    if (body) { out.push(body); out.push(""); }
  }
}

// ── Write output ──────────────────────────────────────────────────────────────
const result = out.join("\n");
if (values.out) {
  writeFileSync(resolve(values.out), result + "\n", "utf8");
  process.stderr.write(`Written to ${values.out}\n`);
} else {
  process.stdout.write(result + "\n");
}
