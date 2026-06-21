---
name: dnd-characters
description: >
  Look up 5e character creation content using SRD reference files. Use this skill when
  designing NPCs with class levels, answering player build questions, or verifying what
  a character gains at a specific level — even if the answer seems obvious, read the file
  to confirm 2024 mechanics. Invoke for: class features at a given level, what a background
  or species gives, how a feat works, what an Eldritch Invocation or Metamagic option does,
  how multiclassing works, what the XP table looks like, point buy or standard array rules,
  starting equipment, or building an NPC with class levels. Covers Chapter 2 (Creating a
  Character) and all 12 SRD classes, 4 backgrounds, 9 species, and 17 feats.
  Not for spell descriptions (dnd-spells), item properties (dnd-items),
  monster stats (dnd-monsters), or general combat/rules (dnd-rules).
---

# Character Creation Reference

Always read the relevant SRD file before answering — don't rely on training data alone.

## Setup

If `$DM_SKILLS_DIR` is unset (`echo $DM_SKILLS_DIR` is blank), derive it 4 levels up
from the "Base directory for this skill" path shown at the top of context:
```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```

## Content Map

All paths resolve from: `$DM_SKILLS_DIR/reference/srd/`

Read the relevant INDEX.md to find files and key metadata:
- `classes/INDEX.md` — 12 classes with primary ability, hit die, saves, armor, SRD subclass
- `classes/optional-features/INDEX.md` — 21 Eldritch Invocations + 8 Metamagic options with prerequisites
- `feats/INDEX.md` — 17 feats grouped by category (origin, fighting style, general, epic boon) with prerequisites
- `origins/INDEX.md` — 4 backgrounds (ability grants + origin feat) and 9 species (size, speed, key traits)
- `character-creation/INDEX.md` — creation process, level advancement, multiclassing, and more

**Note:** `feats/two-weapon-fighting.md` is the feat; `rules-glossary/rules-definitions/two-weapon-fighting.md`
is the action — same slug, different content.

**SRD scope:** One subclass per class is included. If a requested subclass isn't in the file, say so
and name the available one (see `classes/INDEX.md`).

## Workflow

**Named class feature or invocation?** → read the class or optional-feature file directly.

**"What does X class get at level N?"** → read `classes/<class>.md`; the class table
is near the top; features are in order of level below it.

**"What does Background/Species/Feat X give?"** → read the relevant file from the
map above.

**"How does [creation step] work?"** → read `character-creation/create-your-character.md`;
use the headings (Step 1–5) to find the relevant section.

**Building an NPC?** → read their class file for features, their species for traits,
then consult dnd-spells or dnd-items for spell lists or gear as needed.

**If the content isn't in the SRD reference files** (e.g., a non-SRD background, a
subclass not listed in the class file, a species beyond the 9 available): say so clearly,
answer from general 5e knowledge, and flag it as outside SRD 5.2.1.

## Output Format

1. Quote the relevant table or feature text directly — accuracy matters more than brevity
2. For class features: include level, name, and mechanical effect
3. For feats: include prerequisites (if any) and full benefit
4. Note the source file so the DM can verify or read further
