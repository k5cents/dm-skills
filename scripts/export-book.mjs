#!/usr/bin/env node
/**
 * export-book.mjs
 *
 * Export a 5etools book's chapters as individual markdown files using the
 * 5etools RendererMarkdown class for faithful HTML-tag-free output.
 *
 * Usage:
 *   node scripts/export-book.mjs <BOOK_ID> [options]
 *   node scripts/export-book.mjs --file /path/to/collection.json --book-id MYBOOK
 *
 * Options:
 *   --out <dir>           Output directory (default: sourcebooks/<BOOK_ID>/)
 *   --file <path>         Load from an arbitrary JSON file instead of known sources
 *   --book-id <id>        Book ID when using --file (used for output dir naming)
 *   --no-skip-credits     Include the Credits chapter (skipped by default)
 *
 * Known book IDs (passed as positional arg):
 *   ERLW, EFA                         Eberron sourcebooks (5etools-src)
 *   XPHB, XDMG, XMM, PHB, DMG        Core rulebooks (5etools-src)
 *   ExploringEberron24                 EE 2024 (5etools-homebrew)
 *   ChroniclesOfEberron                Keith Baker supplement (5etools-homebrew)
 *   FoEQuickstone                      Frontiers of Eberron (5etools-homebrew)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { parseArgs } from "util";

// ── Paths ─────────────────────────────────────────────────────────────────────
// Repo root auto-detected from script location. External repos default to
// siblings of this repo, overridable via FIVETOOLS_SRC / FIVETOOLS_HOMEBREW.
const REPO_ROOT   = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const _toolsSrc   = process.env.FIVETOOLS_SRC
  ?? join(dirname(REPO_ROOT), "5etools-src");
const _homebrew   = process.env.FIVETOOLS_HOMEBREW
  ?? join(dirname(REPO_ROOT), "5etools-homebrew");
const TOOLS_JS    = `file://${_toolsSrc}/js`;
const TOOLS_BOOKS = `${_toolsSrc}/data/book`;
const HOMEBREW    = `${_homebrew}/collection`;

// ── 5etools dependency chain ──────────────────────────────────────────────────
// These files use globalThis assignments (not ES exports) so importing them
// as side-effect-only modules populates the global namespace for RendererMarkdown.
for (const mod of ["parser.js", "utils.js", "utils-config.js", "hist.js", "render.js", "render-markdown.js"]) {
  await import(`${TOOLS_JS}/${mod}`);
}

// ── Known book sources ────────────────────────────────────────────────────────
const FROM_TOOLS = new Map([
  ["ERLW",  "book-erlw.json"],
  ["EFA",   "book-efa.json"],
  ["XPHB",  "book-xphb.json"],
  ["PHB",   "book-phb.json"],
  ["XDMG",  "book-xdmg.json"],
  ["DMG",   "book-dmg.json"],
  ["XMM",   "book-xmm.json"],
  ["TCE",   "book-tce.json"],
  ["XGE",   "book-xge.json"],
  ["XSAC",  "book-xsac.json"],
]);

const FROM_HOMEBREW = new Map([
  ["ExploringEberron24",  "Keith Baker; Exploring Eberron - 2024.json"],
  ["ChroniclesOfEberron", "Keith Baker; Chronicles of Eberron.json"],
  ["FoEQuickstone",       "Keith Baker; Frontiers of Eberron Quickstone.json"],
]);

// ── CLI ───────────────────────────────────────────────────────────────────────
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    out:              { type: "string"  },
    file:             { type: "string"  },
    "book-id":        { type: "string"  },
    "skip-credits":   { type: "boolean", default: true },
    // Select a single chapter by 0-based index (e.g. --chapter 1)
    "chapter":        { type: "string"  },
    // Split each chapter's top-level `section` entries into separate files.
    // Output goes to <out>/<chapter-slug>/<section-slug>.md
    "by-section":     { type: "boolean", default: false },
    // Comma-separated section names to include (slugified match); skips all others
    "only-sections":  { type: "string"  },
  },
  allowPositionals: true,
});

const bookId = positionals[0] ?? values["book-id"];

if (!bookId && !values.file) {
  console.error("Usage: node scripts/export-book.mjs <BOOK_ID> [--out <dir>]");
  console.error(`\nKnown IDs:\n  ${[...FROM_TOOLS.keys(), ...FROM_HOMEBREW.keys()].join(", ")}`);
  process.exit(1);
}

// ── Load book data ────────────────────────────────────────────────────────────
function loadJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (e) {
    console.error(`Failed to read ${path}: ${e.message}`);
    process.exit(1);
  }
}

let chapters;
let slug; // 5etools source slug, lowercased (e.g. "erlw", "exploringeberron24")

if (values.file) {
  // Arbitrary file path — handles both 5etools-src format and homebrew collection format
  const raw = loadJson(values.file);
  chapters = raw.bookData?.[0]?.data ?? raw.data;
  // Prefer source ID from the JSON itself; fall back to --book-id arg lowercased
  slug = (raw.book?.[0]?.id ?? raw.bookData?.[0]?.source ?? bookId ?? "book").toLowerCase();

} else if (FROM_TOOLS.has(bookId)) {
  const filename = FROM_TOOLS.get(bookId);           // e.g. "book-erlw.json"
  const raw = loadJson(join(TOOLS_BOOKS, filename));
  chapters = raw.data;
  // Derive slug from filename: "book-erlw.json" → "erlw"
  slug = filename.replace(/^book-/, "").replace(/\.json$/, "").toLowerCase();

} else if (FROM_HOMEBREW.has(bookId)) {
  const raw = loadJson(join(HOMEBREW, FROM_HOMEBREW.get(bookId)));
  chapters = raw.bookData?.[0]?.data;
  // Source ID is in the book metadata
  slug = (raw.book?.[0]?.id ?? bookId).toLowerCase();

} else {
  console.error(`Unknown book ID: "${bookId}"`);
  console.error(`Known IDs: ${[...FROM_TOOLS.keys(), ...FROM_HOMEBREW.keys()].join(", ")}`);
  process.exit(1);
}

if (!chapters?.length) {
  console.error("No chapter data found. Check the JSON structure.");
  process.exit(1);
}

// ── Output directory ──────────────────────────────────────────────────────────
const outDir = values.out ?? join(REPO_ROOT, "sourcebooks", slug);
mkdirSync(outDir, { recursive: true });

// ── Slug helper ───────────────────────────────────────────────────────────────
// Converts chapter names like "Chapter 3: Faiths of Eberron" → "faiths-of-eberron"
// and "Chapter 1: Character Creation - Dragonmarks" → "character-creation-dragonmarks"
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/^chapter\s+\d+:\s*/i, "")  // strip "Chapter N: " prefix
    .replace(/\s+-\s+/g, "-")            // " - " (subsection separator) → "-"
    .replace(/[''""]/g, "")             // strip curly quotes
    .replace(/[^a-z0-9]+/g, "-")        // everything else non-alphanumeric → "-"
    .replace(/^-+|-+$/g, "");           // trim leading/trailing hyphens
}

// ── Render and write ──────────────────────────────────────────────────────────
const renderer = RendererMarkdown.get();
const usedFilenames = new Set();
let written = 0;
let skipped = 0;

// Optional single-chapter filter
const chapterFilter = values["chapter"] !== undefined ? parseInt(values["chapter"], 10) : null;
const bySection     = values["by-section"];

const filteredChapters = chapters
  .map((ch, i) => ({ ch, i }))
  .filter(({ i }) => chapterFilter === null || i === chapterFilter);

console.log(`\nExporting ${slug} (${filteredChapters.length} chapter(s)) → ${outDir}\n`);

for (const { ch, i } of filteredChapters) {
  const name   = ch.name ?? `Chapter ${i}`;
  const chSlug = slugify(name) || `chapter-${i}`;
  const padded = String(i).padStart(2, "0");

  // Skip credits by default — they're usually boilerplate
  if (values["skip-credits"] && /^credits$/i.test(name.trim())) {
    console.log(`  [skip] ch${padded} "${name}"`);
    skipped++;
    continue;
  }

  if (bySection) {
    // ── By-section mode: one file per top-level `section` entry ────────────
    // Non-section entries (intro prose, images, lists) go into _intro.md
    // When --chapter selects a single chapter, write directly into outDir.
    const chDir = (chapterFilter !== null) ? outDir : join(outDir, chSlug);
    mkdirSync(chDir, { recursive: true });

    const entries = ch.entries ?? [];
    const introEntries = entries.filter(e => !e || typeof e !== "object" || e.type !== "section");
    const sections     = entries.filter(e => e && typeof e === "object" && e.type === "section");

    // Optional: filter sections by name (--only-sections "name1,name2,...")
    const onlyFilter = values["only-sections"]
      ? values["only-sections"].split(",").map(s => s.trim().toLowerCase())
      : null;

    // Write intro prose if there's non-trivial content (ignore lone images).
    // Skip when --only-sections is active — the intro belongs to the full chapter.
    const substantiveIntro = onlyFilter ? [] : introEntries.filter(e => {
      if (typeof e === "string") return e.trim().length > 0;
      return e && e.type !== "image";
    });
    if (substantiveIntro.length > 0) {
      const introEntry = { type: "section", name, entries: introEntries };
      try {
        const md = renderer.render(introEntry);
        writeFileSync(join(chDir, "_intro.md"), md, "utf8");
        console.log(`  [write] ${chSlug}/_intro.md  (${(md.length / 1024).toFixed(1)} KB)`);
        written++;
      } catch (err) {
        console.error(`  [error] ${chSlug}/_intro: ${err.message}`);
      }
    }

    // Write each section as its own file (or subdirectory if deeply splittable)
    const usedSecNames = new Set();
    for (const sec of (onlyFilter ? sections.filter(s => onlyFilter.includes(slugify(s.name ?? ""))) : sections)) {
      const secName = sec.name ?? "unnamed";
      let secSlug   = slugify(secName) || "unnamed";
      // Deduplicate within the chapter
      if (usedSecNames.has(secSlug)) {
        let n = 2;
        while (usedSecNames.has(`${secSlug}-${n}`)) n++;
        secSlug = `${secSlug}-${n}`;
      }
      usedSecNames.add(secSlug);

      const secEntries = sec.entries ?? [];
      // Auto-split sections whose sub-entries are all individually named
      // (statblock, entries-with-name) and numerous enough to warrant their own files.
      const namedSubEntries = secEntries.filter(e =>
        e && typeof e === "object" && e.name &&
        (e.type === "statblock" || e.type === "entries" || e.type === "inset")
      );
      const splitThreshold = 8;
      const shouldSplit = namedSubEntries.length >= splitThreshold &&
                          namedSubEntries.length === secEntries.filter(e => e && typeof e === "object").length;

      if (shouldSplit) {
        // Each named sub-entry becomes its own file in a subdirectory
        const secDir = join(chDir, secSlug);
        mkdirSync(secDir, { recursive: true });
        console.log(`  [split] ${chSlug}/${secSlug}/  (${namedSubEntries.length} entries)`);
        const usedEntryNames = new Set();
        for (const entry of namedSubEntries) {
          let entSlug = slugify(entry.name) || "unnamed";
          if (usedEntryNames.has(entSlug)) {
            let n = 2;
            while (usedEntryNames.has(`${entSlug}-${n}`)) n++;
            entSlug = `${entSlug}-${n}`;
          }
          usedEntryNames.add(entSlug);
          try {
            const md = renderer.render(entry);
            writeFileSync(join(secDir, `${entSlug}.md`), md, "utf8");
            written++;
          } catch (err) {
            console.error(`  [error] ${chSlug}/${secSlug}/${entry.name}: ${err.message}`);
          }
        }
        console.log(`         → ${usedEntryNames.size} files written`);
      } else {
        const entryObj = { type: "section", name: secName, entries: secEntries };
        try {
          const md = renderer.render(entryObj);
          const filename = `${secSlug}.md`;
          writeFileSync(join(chDir, filename), md, "utf8");
          console.log(`  [write] ${chSlug}/${filename}  (${(md.length / 1024).toFixed(1)} KB)`);
          written++;
        } catch (err) {
          console.error(`  [error] ${chSlug}/${secName}: ${err.message}`);
        }
      }
    }

  } else {
    // ── Default mode: one file per chapter ─────────────────────────────────
    let filename = `ch${padded}-${chSlug}.md`;
    if (usedFilenames.has(filename)) {
      filename = `ch${padded}-${chSlug}-b.md`;
      let suffix = "c";
      while (usedFilenames.has(filename)) {
        filename = `ch${padded}-${chSlug}-${suffix}.md`;
        suffix = String.fromCharCode(suffix.charCodeAt(0) + 1);
      }
    }
    usedFilenames.add(filename);

    const entryObj = { type: "section", name, entries: ch.entries ?? [] };
    let md;
    try {
      md = renderer.render(entryObj);
    } catch (err) {
      console.error(`  [error] ch${padded} "${name}": ${err.message}`);
      continue;
    }

    writeFileSync(join(outDir, filename), md, "utf8");
    const kb = (md.length / 1024).toFixed(1);
    console.log(`  [write] ${filename}  (${kb} KB)`);
    written++;
  }
}

console.log(`\nDone — ${written} written, ${skipped} skipped`);
console.log(`Output: ${outDir}`);
