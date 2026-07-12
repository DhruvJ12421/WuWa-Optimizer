# Game Data Verification

## Current status

The bundled data version is `mvp-2026.07-unverified`. Values are sufficient to exercise the complete pipeline but are not yet authoritative.

The UI and documentation must retain this warning until each supported value has evidence from the current English in-game UI.

## Verification checklist

For Spectro Rover, Chixia, Baizhi, and each representative weapon:

1. Record the game version and verification date.
2. Capture English level-90 base HP, ATK, DEF, Crit. Rate, and Crit. DMG.
3. Capture weapon level-90 base ATK and secondary stat.
4. Capture each supported attack at Forte level 10, including whether the displayed percentage is per hit or total.
5. Record Sonata trigger conditions, stack rules, duration, target, and displayed bonus.
6. Validate normal and critical output against a target with known level and resistance.
7. Add or update a hand-calculated test fixture before changing checked-in values.

Do not use leaked or unreleased content. Do not copy implementation or data files from GPL projects. External sources require explicit approval and must have compatible redistribution terms.

## Rounding

Calculations retain floating-point precision internally. Formatting rounds only at the display boundary. A fixture passes when it matches the game-displayed integer under the documented game rounding behavior; broad percentage tolerances must not be used to conceal formula errors.
