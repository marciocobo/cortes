## 1. Cut modal precision

- [x] 1.1 Add a `TRIM_STEP_SEC = 0.1` constant near `CutModal` in `clip-studio/src/app/(dashboard)/videos/VideoLibrary.tsx`.
- [x] 1.2 Update the pointer-drag handler to round to the nearest `TRIM_STEP_SEC` instead of the nearest whole second.
- [x] 1.3 Update `handleTrimStartChange`/`handleTrimEndChange`'s minimum-gap clamp to use `TRIM_STEP_SEC` instead of the hardcoded `1`.
- [x] 1.4 Update `formatTime()` to render one decimal place, matching the mockup's `Início`/`Fim` format.

## 2. Keyboard nudge

- [x] 2.1 Add `tabIndex={0}` to both handle elements so they're focusable.
- [x] 2.2 Add `onKeyDown` on both handles: ArrowLeft/ArrowRight call `handleTrimStartChange`/`handleTrimEndChange` with `±TRIM_STEP_SEC`; Shift+ArrowLeft/ArrowRight use `±1` instead. Prevent default so the page doesn't scroll on arrow-key press.

## 3. Mobile stepper

- [x] 3.1 Add `-`/`+` buttons flanking the `Início` label, wired to `handleTrimStartChange` with `∓TRIM_STEP_SEC`.
- [x] 3.2 Add `-`/`+` buttons flanking the `Fim` label, wired to `handleTrimEndChange` with `∓TRIM_STEP_SEC`.
- [x] 3.3 Size the buttons for touch (comfortable tap target, consistent with this file's existing `.icon-btn` sizing convention).

## 4. Verification

- [x] 4.1 `tsc --noEmit` and `eslint` on the changed file.
- [x] 4.2 Deploy per `clip-studio/deploy/README.md` (with user permission, per this project's standing rule for touching the VPS).
- [x] 4.3 Manual test against `clipstudio.mcobo.com.br`: drag to select a sub-1-second range (e.g. ~0.3-0.5s), confirm the labels show tenths and the value isn't snapped to a whole second; save it and confirm the resulting clip's real duration is that short. Confirm a normal multi-second trim still works exactly as before. Confirmed by user (also drove two follow-up fixes: 0/duration clamping on keyboard+stepper nudges, and throttling the preview seek to one per animation frame so dragging actually shows the frame instead of freezing on a remote/streamed video source).
- [x] 4.4 Manual test of keyboard nudge: focus a handle (Tab), press ArrowLeft/ArrowRight and confirm 0.1s movement; hold Shift and confirm 1s movement; confirm bounds are respected (can't nudge past the other handle or past 0/duration). Confirmed by user.
- [x] 4.5 Manual test of the mobile stepper (real phone or browser device emulation): tap +/- next to Início/Fim, confirm 0.1s movement per tap and that bounds are respected the same way. Confirmed by user.
