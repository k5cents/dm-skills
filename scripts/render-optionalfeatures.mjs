#!/usr/bin/env node
/**
 * render-optionalfeatures.mjs
 *
 * Render SRD 5.2.1 optional class features to individual markdown files.
 * Outputs to reference/srd/classes/optional-features/.
 *
 * Source: optionalfeatures.json — 29 entries with srd52: true (all XPHB):
 *   EI (Eldritch Invocations): 21 — Warlock
 *   MM (Metamagic): 8 — Sorcerer
 *
 * Usage:
 *   node scripts/render-optionalfeatures.mjs [--out <dir>]
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
  ?? join(REPO_ROOT, "reference", "srd", "classes", "optional-features");
mkdirSync(outDir, { recursive: true });

// ── Tag stripping ─────────────────────────────────────────────────────────────
const TAG_RE = /\{@(\w+) ([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
function stripTags(s) {
  return String(s).replace(TAG_RE, (_, tag, content) => {
    const parts = content.split("|");
    if (["filter", "book", "adventure", "deck", "note"].includes(tag)) return parts[0];
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

// ── Prerequisite renderer ─────────────────────────────────────────────────────
function renderPrereq(prereqs) {
  if (!prereqs?.length) return null;
  const parts = [];
  for (const req of prereqs) {
    if (req.level) {
      const cls = req.level.class?.name ?? "Unknown";
      parts.push(`${cls} level ${req.level.level}`);
    }
    if (req.spell) {
      for (const s of req.spell) {
        parts.push(s.entry ?? s.entrySummary ?? "a spell");
      }
    }
    if (req.feat) {
      for (const f of req.feat) {
        parts.push(f.entry ?? f.entrySummary ?? "a feat");
      }
    }
    if (req.pact) {
      parts.push(`Pact of the ${req.pact.charAt(0).toUpperCase() + req.pact.slice(1)}`);
    }
  }
  return parts.length ? parts.join(", ") : null;
}

// ── Feature type labels ───────────────────────────────────────────────────────
const TYPE_LABEL = {
  EI: "Eldritch Invocation",
  MM: "Metamagic",
};
const TYPE_CLASS = {
  EI: "Warlock",
  MM: "Sorcerer",
};

// ── Load and filter ───────────────────────────────────────────────────────────
const raw      = JSON.parse(readFileSync(join(DATA, "optionalfeatures.json"), "utf8"));
const features = (raw.optionalfeature ?? [])
  .filter(f => f.srd52)
  .sort((a, b) => a.name.localeCompare(b.name));

// ── Render ────────────────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();
let written = 0;

for (const feature of features) {
  const typeKey  = (feature.featureType ?? [])[0] ?? "?";
  const typeLabel = TYPE_LABEL[typeKey] ?? typeKey;
  const classLabel = TYPE_CLASS[typeKey] ?? "";
  const prereq  = renderPrereq(feature.prerequisite);

  const entryObj = { type: "section", name: feature.name, entries: feature.entries ?? [] };
  const body = stripTags(renderer.render(entryObj));

  // Build header block: name, type line, optional prerequisite
  const lines = [body.split("\n")[0]]; // # Name
  lines.push(`*${typeLabel}${classLabel ? ` — ${classLabel}` : ""}*`);
  if (prereq) lines.push(`*Prerequisite: ${prereq}*`);
  lines.push("");
  lines.push(body.split("\n").slice(2).join("\n").trim());

  const md = lines.join("\n") + "\n";
  const filename = `${slugify(feature.name)}.md`;
  writeFileSync(join(outDir, filename), md, "utf8");
  console.log(`  wrote ${filename}  [${typeLabel}]`);
  written++;
}

console.log(`\nWrote ${written} optional features → ${outDir}`);
