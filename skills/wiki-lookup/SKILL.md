---
name: wiki-lookup
description: >
  Fetch Eberron lore from the Eberron fandom wiki (eberron.fandom.com) for topics
  not covered in the local sourcebooks. Use this skill when the user asks about
  3.5e-era Eberron content (Five Nations, Forge of War, Dragonmarked, etc.), named
  NPCs who only appear in older supplements, minor tribes, clans, or locations, or
  anything that returns no results in the local sourcebook grep. Also use when
  explicitly asked to "check the wiki." Saves fetched articles to
  sourcebooks/eberron-wiki/ for future grep access. CC BY-SA 3.0 content.
---

# Eberron Wiki Lookup

Fetch articles from the Eberron fandom wiki via the MediaWiki API and convert them
to clean, grep-friendly markdown. Content covers all published Eberron editions
(3.5e through 5.5e) and is licensed CC BY-SA 3.0.

Fetched files land in `$DM_SKILLS_DIR/sourcebooks/eberron-wiki/` and are
automatically picked up by future `eberron-lore` skill grep searches.

## When to use

- Topic not found in any local sourcebook grep
- Explicitly asked for 3.5e lore (Five Nations, Forge of War, Dragonmarked, etc.)
- Named NPC, minor tribe, clan, or location not in ERLW/EE/EFOTA/FoE
- User says "check the wiki" or "look that up"

## Workflow

### Step 1: Try local cache first

Before hitting the network, grep the already-fetched wiki cache:

```bash
grep -ril "KEYWORD" $DM_SKILLS_DIR/sourcebooks/eberron-wiki/ 2>/dev/null
```

If a match exists, Read that file — no network call needed.

### Step 2: Fetch by exact article title

If you know (or can guess) the wiki article title, fetch it directly:

```bash
python3 $DM_SKILLS_DIR/scripts/fetch-wiki.py "Article Title" --print 2>/dev/null
```

The `--print` flag outputs the article to stdout AND saves it to `eberron-wiki/`.
Titles are case-sensitive on the API; try the most natural capitalization first.
If the article title has an apostrophe (e.g. `Haruuc Shaarat'kor`), quote the whole
argument.

### Step 3: Search when title is unknown

If the exact title is uncertain, use `--search` to find the best-matching article:

```bash
# Returns top match; use --search-limit N for multiple results
python3 $DM_SKILLS_DIR/scripts/fetch-wiki.py --search "druid clan darguun" --print 2>/dev/null
```

The script prints the matched title to stderr and the article to stdout.
Pass `--search-limit 3` to pull the top 3 matches if the first isn't right.

### Step 4: Fetch a whole category

For a topic cluster (e.g. all goblinoid organizations, all Darguun locations):

```bash
python3 $DM_SKILLS_DIR/scripts/fetch-wiki.py \
  --category "Organizations in Darguun" 2>&1 | head -5  # preview count first
```

Then run without `2>&1 | head` to save all files. Large categories can be
50+ articles; check the count before committing to a full fetch.

## Output format

Each saved file is clean markdown:
- `# Article Title`
- Attribution blockquote
- Infobox as structured `> **Type** / **key: value**` block (if present)
- Prose sections as `## H2` / `### H3` headers
- No wikilinks, no citation markers, no category noise

Files are named by slug: `Haruuc Shaarat'kor` → `haruuc-shaarat-kor.md`.

## Synthesizing the answer

After fetching, answer the question from the article content. Cite as
*(Eberron wiki)* inline. Note if the content is from a 3.5e source (the wiki
usually mentions the source book in the intro) — flag edition differences
if relevant to a 5.5e campaign.

If the wiki article is sparse or stub-quality, say so and suggest confirming
with a physical copy of the source.

## DM_SKILLS_DIR

If `$DM_SKILLS_DIR` is unset, derive it from the skill path shown at the top of
this context — go 4 levels up from `.../plugins/dnd/skills/wiki-lookup/`:

```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```
