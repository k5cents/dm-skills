#!/usr/bin/env node
/**
 * render-equipment.mjs
 *
 * Render SRD base equipment from 5etools items-base.json to markdown tables.
 * Groups items by category into separate files.
 *
 * Usage:
 *   node scripts/render-equipment.mjs [options]
 *
 * Options:
 *   --srd            Filter to srd52-flagged items only (SRD 5.2.1)
 *   --out <dir>      Output directory (default: reference/srd/equipment)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { parseArgs } from "util";

const REPO_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TOOLS_SRC = process.env.FIVETOOLS_SRC
  ?? join(dirname(REPO_ROOT), "5etools-src");
const DATA = join(TOOLS_SRC, "data");

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    srd: { type: "boolean", default: false },
    out: { type: "string" },
  },
});

const outDir = values.out ?? join(REPO_ROOT, "reference", "srd", "equipment");
mkdirSync(outDir, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripSrc(code) { return (code ?? "").split("|")[0]; }

function fmtCost(cp) {
  if (!cp) return "—";
  if (cp % 100 === 0) return `${cp / 100} gp`;
  if (cp % 10 === 0)  return `${cp / 10} sp`;
  return `${cp} cp`;
}

const DMG_TYPES = { S: "Slashing", P: "Piercing", B: "Bludgeoning" };
const PROPERTIES = {
  V: "Versatile", F: "Finesse", L: "Light", T: "Thrown",
  "2H": "Two-Handed", H: "Heavy", R: "Reach", A: "Ammunition",
  LD: "Loading", S: "Special",
};

function fmtProps(props) {
  if (!props?.length) return "—";
  return props.map(p => {
    let code, note;
    if (typeof p === "string") {
      code = stripSrc(p);
    } else {
      code = stripSrc(p.uid ?? p.abbreviation ?? "");
      note = p.note;
    }
    const name = PROPERTIES[code] ?? code;
    return note ? `${name} (${note})` : name;
  }).filter(Boolean).join(", ");
}

function fmtDmg(item) {
  if (!item.dmg1) return "—";
  const type = DMG_TYPES[item.dmgType] ?? item.dmgType ?? "";
  const d2 = item.dmg2 ? ` (${item.dmg2} ${type} versatile)` : "";
  return `${item.dmg1} ${type}${d2}`;
}

function fmtAc(item) {
  if (item.ac === undefined) return "—";
  return String(item.ac) + (item.dexterityMax !== undefined ? ` + Dex (max ${item.dexterityMax})` : "");
}

function fmtStrReq(item) {
  return item.strength ? `Str ${item.strength}` : "—";
}

function fmtMastery(item) {
  return (item.mastery ?? []).map(m => stripSrc(m)).join(", ") || "—";
}

function table(headers, rows) {
  const sep = headers.map(h => "-".repeat(h.length || 3));
  const header = `| ${headers.join(" | ")} |`;
  const divider = `| ${sep.join(" | ")} |`;
  const body = rows.map(r => `| ${r.join(" | ")} |`).join("\n");
  return `${header}\n${divider}\n${body}`;
}

// ── Load and filter ───────────────────────────────────────────────────────────
const raw   = JSON.parse(readFileSync(join(DATA, "items-base.json"), "utf8"));
let   items = raw.baseitem ?? [];
if (values.srd) items = items.filter(i => i.srd52);
items.sort((a, b) => a.name.localeCompare(b.name));

function byType(...codes) {
  return items.filter(i => codes.includes(stripSrc(i.type ?? "")));
}

// ── Weapons ───────────────────────────────────────────────────────────────────
const weapons = byType("M", "R");
if (weapons.length) {
  const simple  = weapons.filter(w => w.weaponCategory === "simple");
  const martial = weapons.filter(w => w.weaponCategory === "martial");

  let md = "# Weapons\n\n";

  function weaponTable(ws) {
    return table(
      ["Name", "Cost", "Damage", "Weight", "Properties", "Mastery"],
      ws.map(w => [
        w.name,
        fmtCost(w.value),
        fmtDmg(w),
        w.weight ? `${w.weight} lb.` : "—",
        fmtProps(w.property),
        fmtMastery(w),
      ])
    );
  }

  md += "## Simple Weapons\n\n";
  md += weaponTable(simple) + "\n\n";
  md += "## Martial Weapons\n\n";
  md += weaponTable(martial) + "\n";

  writeFileSync(join(outDir, "weapons.md"), md, "utf8");
  console.log(`  weapons.md  (${simple.length} simple, ${martial.length} martial)`);
}

// ── Ammunition ────────────────────────────────────────────────────────────────
const ammo = byType("A");
if (ammo.length) {
  const md = "# Ammunition\n\n" + table(
    ["Name", "Cost", "Weight"],
    ammo.map(a => [a.name, fmtCost(a.value), a.weight ? `${a.weight} lb.` : "—"])
  ) + "\n";
  writeFileSync(join(outDir, "ammunition.md"), md, "utf8");
  console.log(`  ammunition.md  (${ammo.length} items)`);
}

// ── Armor ─────────────────────────────────────────────────────────────────────
const armor = byType("LA", "MA", "HA", "S");
if (armor.length) {
  const armorCategoryOrder = ["LA", "MA", "HA", "S"];
  const armorCategoryNames = { LA: "Light Armor", MA: "Medium Armor", HA: "Heavy Armor", S: "Shields" };

  let md = "# Armor\n\n";
  for (const typeCode of armorCategoryOrder) {
    const group = armor.filter(a => stripSrc(a.type ?? "") === typeCode);
    if (!group.length) continue;
    md += `## ${armorCategoryNames[typeCode]}\n\n`;
    md += table(
      ["Name", "Cost", "AC", "Strength", "Stealth", "Weight"],
      group.map(a => [
        a.name,
        fmtCost(a.value),
        fmtAc(a),
        fmtStrReq(a),
        a.stealth ? "Disadvantage" : "—",
        a.weight ? `${a.weight} lb.` : "—",
      ])
    ) + "\n\n";
  }
  writeFileSync(join(outDir, "armor.md"), md.trim() + "\n", "utf8");
  console.log(`  armor.md  (${armor.length} items)`);
}

// ── Tools ─────────────────────────────────────────────────────────────────────
const tools = byType("AT", "INS", "GS");
if (tools.length) {
  const byCategory = {
    "Artisan's Tools": tools.filter(t => stripSrc(t.type ?? "") === "AT"),
    "Musical Instruments": tools.filter(t => stripSrc(t.type ?? "") === "INS"),
    "Gaming Sets": tools.filter(t => stripSrc(t.type ?? "") === "GS"),
  };

  let md = "# Tools\n\n";
  for (const [cat, ts] of Object.entries(byCategory)) {
    if (!ts.length) continue;
    md += `## ${cat}\n\n`;
    md += table(
      ["Name", "Cost", "Weight"],
      ts.map(t => [t.name, fmtCost(t.value), t.weight ? `${t.weight} lb.` : "—"])
    ) + "\n\n";
  }
  writeFileSync(join(outDir, "tools.md"), md.trim() + "\n", "utf8");
  console.log(`  tools.md  (${tools.length} items)`);
}

// ── Spellcasting Focuses ──────────────────────────────────────────────────────
const focuses = byType("SCF");
if (focuses.length) {
  const md = "# Spellcasting Focuses\n\n" + table(
    ["Name", "Cost", "Weight"],
    focuses.map(f => [f.name, fmtCost(f.value), f.weight ? `${f.weight} lb.` : "—"])
  ) + "\n";
  writeFileSync(join(outDir, "spellcasting-focuses.md"), md, "utf8");
  console.log(`  spellcasting-focuses.md  (${focuses.length} items)`);
}

console.log(`\nDone → ${outDir}`);
