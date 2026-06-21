---
name: dnd-rules
description: >
  Answer 5e mechanical rules questions using SRD reference files. Invoke for: how does
  X work, what happens in Y situation, which ability or skill is used for Z, what's the
  DC for W, how far/fast/high/long can a character do something, what does a condition
  do, how does cover/light/terrain affect play. Covers Chapter 1 (Playing the Game) and
  Appendix C (Rules Glossary). Not for monster stats (dnd-monsters), spell descriptions
  (dnd-spells), item properties (dnd-items), or character creation.
---

# Rules Reference

Always read the relevant SRD file before answering — don't rely on training data alone.
The _shared/references/ tables (conditions, damage types, encounter math) are already
in context and don't need to be re-read.

## Setup

If `$DM_SKILLS_DIR` is unset (`echo $DM_SKILLS_DIR` is blank), derive it 4 levels up
from the "Base directory for this skill" path shown at the top of context:
```sh
export DM_SKILLS_DIR=$(cd "<base-dir-from-above>/../../../.." && pwd)
```

## Lookup Strategy

**Already in context — answer directly:**
- Condition and status effect mechanics (2024) → `_shared/references/conditions.md`
- Damage types and resistance/immunity rules → `_shared/references/damage-types.md`

For full SRD text on a specific condition, read the individual glossary file (Step 1).

**Step 1 — Named rules term?**
Try `$DM_SKILLS_DIR/reference/srd/rules-glossary/rules-definitions/<kebab-term>.md`

Glossary files use exact kebab-case: `difficult-terrain.md`, `long-jump.md`,
`death-saving-throw.md`. Try the obvious name first; fall back to Step 2 if not found.

Key glossary terms available:

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

| Question type | Read this file |
|---|---|
| Ability scores, modifiers, what each ability measures | `playing-the-game/the-six-abilities.md` |
| Skills list (which ability each uses), proficiency bonus, saving throw profs | `playing-the-game/proficiency.md` |
| D20 Tests, ability checks, saving throws, DC, Advantage/Disadvantage | `playing-the-game/d20-tests.md` |
| Damage rolls, critical hits, resistance, immunity, healing, death saves, temp HP | `playing-the-game/damage-and-healing.md` |
| Actions, Bonus Actions, Reactions, "One Thing at a Time" | `playing-the-game/actions.md` |
| Initiative, movement, attacks, opportunity attacks, cover, mounted combat, underwater | `playing-the-game/combat.md` |
| Light, vision, obscurement, hiding, travel pace, hazards, interacting with objects | `playing-the-game/exploration.md` |
| NPC attitudes, social checks, Insight, Persuasion, Deception in play | `playing-the-game/social-interaction.md` |
| Condition duration, stacking rules | `playing-the-game/conditions.md` |
| Dice notation, d3, percentile dice | `playing-the-game/dice.md` |

All paths resolve from: `$DM_SKILLS_DIR/reference/srd/<path>`

Some questions need two files — e.g., "how does hiding work in dim light" requires
both `exploration.md` (hiding rules) and the glossary's `dim-light.md` or `lightly-obscured.md`.

## Output Format

1. **State the rule** — concise, with all key numbers (dice, distances, DCs, durations)
2. **Quote the relevant table** if one exists in the file (travel pace, skill list, etc.)
3. **One sentence of DM context** only if non-obvious
4. **Cite the source** — file name or chapter section

Keep it tight. A crisp rule is more useful at the table than a paragraph.
