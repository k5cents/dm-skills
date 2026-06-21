---
name: dnd-rules
description: >
  Answer 5e mechanical rules questions using SRD reference files. Use this skill whenever
  a DM needs to resolve a rules question or recall a mechanic during play — even if the
  answer seems obvious, read the file to confirm the 2024 rules (many changed from 2014).
  Invoke for: how does X work, what happens in Y situation, which ability or skill is used
  for Z, what's the DC for W, how far/fast/high/long can a character do something, what
  does a condition do, how does cover/light/terrain affect play, resolving a rules dispute
  at the table. Covers Chapter 1 (Playing the Game) and Appendix C (Rules Glossary).
  Not for monster stats (dnd-monsters), spell descriptions (dnd-spells), item properties
  (dnd-items), or character creation (dnd-characters).
---

# Rules Reference

Always read the relevant SRD file before answering — don't rely on training data alone.

## Setup

If `$DM_SKILLS_DIR` is unset (`echo $DM_SKILLS_DIR` is blank), derive it 4 levels up
from the "Base directory for this skill" path shown at the top of context:
```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```

## Lookup Strategy

**Step 1 — Named rules term?**
Try `$DM_SKILLS_DIR/reference/srd/rules-glossary/rules-definitions/<kebab-term>.md`

Glossary files use exact kebab-case: `difficult-terrain.md`, `long-jump.md`,
`death-saving-throw.md`. Try the obvious name first; fall back to Step 2 if not found.

Key glossary terms available:

*Languages:*
`rules-glossary/languages.md` — Standard Languages (d12 table) and Rare Languages (9 entries, planar or secret origins). Use for: what language does X speak, what are the rare/secret languages, does Primordial have dialects.

*Rules (variantrules):*
`ability-check`, `ability-score-and-modifier`, `action`, `advantage`, `area-of-effect`,
`armor-class`, `armor-training`, `attack-roll`, `attunement`, `bonus-action`,
`breaking-objects`, `bright-light`, `burrow-speed`, `carrying-capacity`, `challenge-rating`,
`climb-speed`, `climbing`, `condition`, `cover`, `crawling`, `creature-type`, `critical-hit`,
`d20-test`, `damage-roll`, `damage-threshold`, `darkness`, `dead`, `death-saving-throw`,
`difficult-terrain`, `difficulty-class`, `dim-light`, `disadvantage`, `expertise`,
`fly-speed`, `flying`, `grappling`, `heavily-obscured`, `heroic-inspiration`, `high-jump`,
`hit-points`, `hover`, `immunity`, `improvised-weapons`, `initiative`, `jumping`,
`knocking-out-a-creature`, `lightly-obscured`, `long-jump`, `long-rest`, `object`,
`passive-perception`, `proficiency`, `reaction`, `resistance`, `ritual`, `saving-throw`,
`short-rest`, `simultaneous-effects`, `size`, `skill`, `speed`, `spell-attack`, `spell`,
`spellcasting-focus`, `temporary-hit-points`, `unarmed-strike`, `vulnerability`,
`weapon-attack`, `weapon`

*Conditions and statuses:*
`blinded`, `bloodied`, `charmed`, `concentration`, `deafened`, `exhaustion`,
`frightened`, `grappled`, `incapacitated`, `invisible`, `paralyzed`, `petrified`,
`poisoned`, `prone`, `restrained`, `stunned`, `surprised`, `unconscious`

*Actions [Action]:*
`attack`, `dash`, `disengage`, `dodge`, `don-or-doff-a-shield`, `end-concentration`,
`escape-a-grapple`, `help`, `hide`, `magic`, `opportunity-attack`, `ready`,
`search`, `two-weapon-fighting`, `utilize`

*Senses:*
`blindsight`, `darkvision`, `tremorsense`, `truesight`

*Hazards [Hazard]:*
`burning`, `dehydration`, `falling`, `malnutrition`, `suffocation`

**Step 2 — Chapter topic?**
Read `$DM_SKILLS_DIR/reference/srd/playing-the-game/INDEX.md` for a one-line topic summary per file.

All paths resolve from: `$DM_SKILLS_DIR/reference/srd/<path>`

Some questions need two files — e.g., "how does hiding work in dim light" requires
both `exploration.md` (hiding rules) and the glossary's `dim-light.md` or `lightly-obscured.md`.

**If the topic isn't in any reference file:** answer from general 5e knowledge, flag that
the rule isn't in the SRD reference files, and note whether it's likely a 2024 DMG rule
(XDMG) or an optional/setting-specific rule not covered by SRD 5.2.1.

## Output Format

1. **State the rule** — concise, with all key numbers (dice, distances, DCs, durations)
2. **Quote the relevant table** if one exists in the file (travel pace, skill list, etc.)
3. **One sentence of DM context** only if non-obvious
4. **Cite the source** — file name or chapter section

Keep it tight. A crisp rule is more useful at the table than a paragraph.
