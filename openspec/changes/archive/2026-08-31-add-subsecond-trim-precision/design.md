## Context

See proposal.md - Why. Everything relevant lives in `CutModal` (`clip-studio/src/app/(dashboard)/videos/VideoLibrary.tsx`): `formatTime()` (display), the pointer-drag handler (`handleHandlePointerMove` → `Math.round(timeFromPointerX(...))`), and `handleTrimStartChange`/`handleTrimEndChange` (which currently clamp the opposite handle to enforce a minimum 1-second gap: `effectiveEnd - 1` / `effectiveStart + 1`). Confirmed the backend already accepts fractional seconds unmodified end-to-end (`Normalizar Corte`'s `Number(b.newStartSec)`, `Baixar e Cortar Clipe`'s `awk`-based range check) — no backend or n8n change needed.

## Goals / Non-Goals

**Goals:**
- Match the mockup's tenths-of-a-second display exactly.
- Let a Clipador actually select and save a sub-1-second cut.

**Non-Goals:**
- Precision finer than 0.1s (the mockup shows one decimal place; nothing in the request or mockup asks for more, e.g. hundredths).
- Any change to how the clip is played back, previewed, or uploaded — only the selection precision and its display.

## Decisions

### Precision constant: 0.1s, applied to both drag rounding and the minimum start/end gap

**Decision:** introduce a single constant (e.g. `TRIM_STEP_SEC = 0.1`) used in two places: the drag handler rounds to the nearest step (`Math.round(timeFromPointerX(e.clientX) / TRIM_STEP_SEC) * TRIM_STEP_SEC`), and `handleTrimStartChange`/`handleTrimEndChange`'s clamp uses `TRIM_STEP_SEC` instead of the hardcoded `1`.

**Why one shared constant instead of two separate values:** the minimum selectable gap and the drag step are the same underlying granularity — decoupling them (e.g. a 0.1s drag step but a 0.5s minimum gap) would let a Clipador drag to what looks like a valid 0.3s selection that then silently snaps or rejects. Keeping them equal avoids that mismatch.

### `formatTime()` shows one decimal place everywhere it's used, not only on Início/Fim

**Decision:** `formatTime()` is shared by all four readouts in the modal (`Início`, `Fim`, the current-time/duration counter, and `Selecionado`). Update it to always render one decimal place; all four pick up the change uniformly.

**Why uniform instead of matching the mockup's static screenshot literally (which only shows decimals on Início/Fim):** the mockup is a static prototype with fixed default values (`0:00.0`/`12:14.0` on Início/Fim, but `0:00 / 12:14` and `Selecionado: 12:14` without decimals) — most likely because those two labels never got exercised with a non-whole-second value in the mockup's own demo state, not a deliberate two-precision design. A single shared formatter showing one decimal everywhere is simpler to implement and avoids an arbitrary inconsistency (why would the selected-duration readout hide the same precision the boundary readouts show?).

### Keyboard nudge: ArrowLeft/Right = ±0.1s, Shift+Arrow = ±1s, on the existing handle elements

**Decision:** the two handle `<div role="slider">` elements already exist with `aria-valuemin`/`aria-valuemax`/`aria-valuenow` set — add `tabIndex={0}` (they aren't focusable today) and an `onKeyDown` that calls the same `handleTrimStartChange`/`handleTrimEndChange` used by dragging, with `±TRIM_STEP_SEC` (or `±1` when `e.shiftKey`) instead of a pointer-derived value. Reusing the same change handlers means keyboard nudges get the same clamping/bounds behavior as dragging for free — no separate validation path to keep in sync.

**Why add a coarse Shift-step instead of only 0.1s:** a clip can be many minutes long — reaching a boundary far from the current position 0.1s at a time via keyboard alone would take hundreds of key presses. Shift+Arrow at a whole second gives fast coarse positioning; releasing Shift for the final fine adjustment reaches the exact 0.1s target.

### Mobile precision: +/- 0.1s stepper buttons next to `Início`/`Fim`, not a drag-only fix

**Decision:** add two small `-`/`+` icon buttons flanking each of the `Início: {formatTime(effectiveStart)}` and `Fim: {formatTime(effectiveEnd)}` labels, each tap calling the same `handleTrimStartChange`/`handleTrimEndChange` with `±TRIM_STEP_SEC`. No touch-drag precision changes are attempted (no snapping assist, no pinch-zoom) — the stepper is the whole answer to imprecise touch dragging.

**Why a stepper instead of trying to make touch-dragging itself more precise:** dragging precision is fundamentally limited by finger size vs. a track that's only a few hundred pixels wide representing a clip that can be many minutes long — no amount of snapping logic changes that physical constraint. A stepper sidesteps the problem entirely: the Clipador drags roughly into position (same as today), then taps to reach the exact 0.1s value, matching how the keyboard-nudge desktop flow already works. This also means the same UI affordance serves both mobile users and desktop users who prefer clicking over dragging - one mechanism, not two.

**Why buttons next to the labels rather than on the handles themselves:** the handles are small circular drag targets (16px) already positioned on a possibly-tiny selected region on the track - cramming two more tap targets onto or right next to them risks mis-taps precisely on the small-screen/short-selection cases this decision exists to help. The `Início`/`Fim` label row has room and is always readably far enough apart from the handles themselves.

## Risks / Trade-offs

- **[Risk] `Baixar e Cortar Clipe`'s existing minimum-output-size check (`< 10240` bytes) could, in theory, reject a genuinely valid very-short cut** if the encoded output happens to fall under 10KB. → Mitigation: not addressed in this change — a single H.264 keyframe at this library's typical 9:16 resolution is well above 10KB in practice even for a sub-1-second clip, so this is a low-probability, pre-existing threshold, not something introduced here. Worth revisiting only if real usage shows it triggering falsely.
- **[Risk] Very fine pointer drags on a long clip's timeline are hard to hit exactly at 0.1s precision by hand** (a 12-minute clip's whole timeline compressed into the same fixed-width track makes each pixel worth multiple seconds). → Mitigation: out of scope for this change — the mockup doesn't show any additional zoom/nudge control, and none was requested; the drag will simply be less precise on long clips than on short ones, same as today's whole-second dragging already is.

## Migration Plan

Frontend-only change in a single file. Deploy per the existing flow (`clip-studio/deploy/README.md`). No rollback complexity — purely a precision/display change, no data model or API contract change.
