## Why

The "Cortar vídeo" modal's timeline currently only lets a Clipador pick start/end at whole-second precision (dragging rounds to the nearest second, and the minimum gap enforced between start and end is 1 full second) — a Clipador who needs to cut out a very brief moment (under 1 second) can't do it. The updated mockup (Claude Design artifact `f668b615-5073-4519-8e79-8b389d47c18f`, "Cortar vídeo" screen) shows "Início"/"Fim" now displayed with tenths-of-a-second precision (e.g. `0:00.0`), confirming the intended granularity.

## What Changes

- The trim timeline's drag precision changes from whole seconds to tenths of a second (0.1s steps).
- The minimum gap enforced between the selected start and end drops from 1s to 0.1s, so a sub-1-second cut is actually selectable.
- Time labels in the cut modal (`Início`, `Fim`, the current-time/duration readout, and the selected-duration readout) display one decimal place, matching the mockup.
- Each trim handle becomes keyboard-operable: with a handle focused, ArrowLeft/ArrowRight nudge it by 0.1s (Shift+Arrow nudges by 1s for faster coarse movement).
- A visible +/- 0.1s stepper is added next to each of `Início`/`Fim`, sized for touch — dragging precisely to 0.1s on a small mobile screen isn't reliable, so mobile users get an exact, tap-driven way to reach the same precision instead of depending on drag accuracy.
- No change to anything outside the cut modal's own UI — the trim webhook and its `Normalizar Corte`/`Baixar e Cortar Clipe` handling already accept and process fractional-second `newStartSec`/`newEndSec` values today (never rounds), so this is a frontend-only change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `clip-studio/video-library`: "Trim (re-cut) clip" gains scenarios establishing sub-second selection precision (0.1s) and the keyboard/stepper ways to reach it, replacing the implicit whole-second assumption in the existing scenarios' wording.

## Impact

- `clip-studio/src/app/(dashboard)/videos/VideoLibrary.tsx` — `CutModal`'s `formatTime`, the pointer-drag handler's rounding, `handleTrimStartChange`/`handleTrimEndChange`'s minimum-gap clamp, new `onKeyDown` handling on the two handle elements, and the new +/- stepper buttons next to `Início`/`Fim`.
- No backend, API route, or n8n workflow changes — `newStartSec`/`newEndSec` already flow through as unrounded numbers end-to-end (confirmed in `Normalizar Corte`'s `Number(b.newStartSec)` and the `awk`-based range validation in `Baixar e Cortar Clipe`, neither of which assumes whole seconds).
