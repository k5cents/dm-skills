---
name: eberron-lore
description: >
  Look up Eberron setting lore from pre-exported sourcebook chapters (ERLW, EE 2024, EFOTA,
  Frontiers of Eberron) and campaign homebrew canon files. Use this skill whenever a question
  touches Eberron setting knowledge: locations, factions, history, dragonmarks, religions,
  culture, the Last War, warforged society, Sharn districts, the Mournland, House politics,
  planes of existence, or anything that requires grounding in Eberron canon before answering.
  Also use it when cross-referencing sources for consistency checks or when the source hierarchy
  matters (campaign homebrew > ERLW > EFOTA > EE > FoE Quickstone).
---

# Eberron Lore Lookup

You have access to pre-exported markdown chapters from four Eberron sourcebooks, plus
campaign-specific homebrew overrides. Use this skill to ground answers in actual source
text before synthesizing.

## Source Hierarchy (highest priority first)

1. **Campaign Homebrew** — `homebrew/context/` in the current campaign repo (if working in one)
2. **ERLW** — `$DM_SKILLS_DIR/sourcebooks/erlw/` (baseline setting, geography, factions)
3. **EFOTA** — `$DM_SKILLS_DIR/sourcebooks/efa/` (Sharn inquisitives, artificers, dragonmarked intrigue)
4. **EE 2024** — `$DM_SKILLS_DIR/sourcebooks/exploringeberron24/` (creator-authored; planes, species, deeper lore)
5. **FoE Quickstone** — `$DM_SKILLS_DIR/sourcebooks/foequickstone/` (western frontier, new Eberron locations)

When sources conflict, apply the hierarchy and flag it explicitly. Campaign homebrew always
wins — it represents intentional DM decisions that override published canon.

## Workflow

### Step 1: Check campaign homebrew first

If working within a campaign repo, grep its `homebrew/context/` directory before touching
the reference sourcebooks. A DM decision documented there supersedes everything.

```bash
grep -ril "KEYWORD" homebrew/context/
```

### Step 2: Search the sourcebooks

Run grep across the Eberron sourcebook directories. Cast wide — use 2–3 keyword variants.

```bash
# Find which files contain the topic
grep -ril "KEYWORD" \
  $DM_SKILLS_DIR/sourcebooks/erlw/ \
  $DM_SKILLS_DIR/sourcebooks/efa/ \
  $DM_SKILLS_DIR/sourcebooks/exploringeberron24/ \
  $DM_SKILLS_DIR/sourcebooks/foequickstone/

# Get surrounding context (10 lines) for a specific file
grep -in -A 10 -B 2 "KEYWORD" $DM_SKILLS_DIR/sourcebooks/erlw/ch08-sharn-city-of-towers.md
```

### Step 3: Read relevant sections

Once you know which files match, Read only those files (or specific sections if large).
Don't load everything — grep output tells you where to look.

Key files by topic (all under `$DM_SKILLS_DIR/sourcebooks/`):

| Topic | Primary file |
|-------|-------------|
| Sharn districts, Cogs, Lower Dura | `erlw/ch08-sharn-city-of-towers.md` |
| Sharn adventure hooks, encounters | `erlw/ch11-building-eberron-adventures-sharn.md` |
| The Last War, political history | `erlw/ch10-building-eberron-adventures-the-last-war.md` |
| Dragonmarks, Houses | `erlw/ch02-character-creation-dragonmarks.md` |
| Khorvaire nations, geography | `erlw/ch05-khorvaire-gazetteer.md` |
| Distant lands (Xen'drik, Sarlona, etc.) | `erlw/ch06-khorvaire-gazetteer-distant-lands.md` |
| Faiths (Blood of Vol, Silver Flame, etc.) | `erlw/ch07-khorvaire-gazetteer-faiths-of-khorvaire.md` |
| Warforged society, Mournland | `erlw/ch13-friends-and-foes.md` |
| Sharn inquisitive model, PI flavor | `efa/ch04-sharn-inquisitives.md` |
| Dragonmarked intrigue, House politics | `efa/ch05-dragonmarked-intrigue.md` |
| Morgrave expeditions, ruins | `efa/ch06-morgrave-expeditions.md` |
| Planes, Dal Quor, Dolurrh | `exploringeberron24/ch05-planes-of-existence.md` |
| Species (Kalashtar, Changelings, etc.) | `exploringeberron24/ch02-species-of-eberron.md` |
| Faiths (deeper theology) | `exploringeberron24/ch03-faiths-of-eberron.md` |
| Uncharted domains, wild regions | `exploringeberron24/ch04-uncharted-domains.md` |
| Western frontier, new settlements | `foequickstone/ch02-the-western-frontier.md` |
| Quickstone city and environs | `foequickstone/ch03-quickstone.md` |

### Step 4: Synthesize

Answer the question using the source text. Be specific — quote or closely paraphrase key
passages rather than summarizing vaguely. Always note which source the information comes
from (e.g. *ERLW ch8*, *EE ch5*, *campaign homebrew*) so the DM can find the passage if needed.

If the topic is **intentionally ambiguous in canon**, say so. Don't resolve Eberron's
deliberate ambiguities (the nature of the Dark Six, whether the Prophecy is real, etc.)
unless the DM asks for a specific interpretation.

If there's a **campaign homebrew override** in `homebrew/context/`, lead with that and note
where it differs from canon.

## Output Format

Answer directly. Lead with the useful thing, not with "I found the following in...". Cite
sources inline with brief labels like *(ERLW ch8)* or *(campaign homebrew)*. Use headers
only if the answer covers multiple distinct sub-topics.

Flag lore inconsistencies immediately — don't smooth them over.
