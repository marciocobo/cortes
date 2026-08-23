## Purpose

Guarantees that the per-clip silence-based start/end adjustment (introduced
29/07/2026) never lets two consecutive Shorts overlap or fall closer together
than the intended minimum gap, even when both clips' boundaries are extended
toward each other independently.

## ADDED Requirements

### Requirement: Adjusted clip boundaries never overlap a neighbor
For any two consecutive clips produced by `Montar Clipes` / `FFmpeg Cortar 9:16`,
the collision clamp SHALL compare each clip's silence-adjusted `start`/`end`
against the **adjusted** (`real_start`/`real_end`) value of the relevant
neighbor — not the neighbor's raw AI-selected timestamp — before applying the
adjustment. If comparing against the raw neighbor timestamp would allow the
final adjusted gap to drop below the minimum gap floor, the clamp SHALL fall
back to the clip's own raw (unadjusted) AI timestamp on that side.

#### Scenario: Both neighbors' adjustments erode toward each other
- **WHEN** clip N's silence-based end-extension and clip N+1's silence-based
  start-retraction would, if both applied independently, leave less than the
  minimum gap (5s) between clip N's real end and clip N+1's real start
- **THEN** at least one side falls back to its raw AI timestamp so the final gap
  between clip N's real end and clip N+1's real start is never below 5s

#### Scenario: Only one neighbor's adjustment would cause a collision
- **WHEN** clip N's end-extension alone (with clip N+1's start unadjusted) would
  already leave less than 5s of gap
- **THEN** clip N's end-extension is clamped back to its raw AI timestamp,
  independent of whether clip N+1 also gets adjusted
