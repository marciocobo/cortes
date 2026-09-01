## MODIFIED Requirements

### Requirement: Trim (re-cut) clip
The system SHALL let a Clipador or Admin manually re-cut a clip's start/end within the clip's own current duration (shortening it), at a precision of at least 0.1 seconds (sub-second cuts are possible), optionally also removing silent segments detected within that selected range (a "jump cut"), persisting the result to the clip's `.mp4` and `_meta.json`.

#### Scenario: Trim succeeds
- **WHEN** a Clipador selects a new start/end within the clip's current duration and confirms "Salvar corte"
- **THEN** the system re-cuts the clip's `.mp4` to the selected range, updates its metadata to reflect the new boundaries, and the clip's duration shown in the library reflects the new range on the next load

#### Scenario: Sub-second cut is selectable
- **WHEN** a Clipador drags the start and end handles to select a range shorter than 1 second (e.g. 0.3s)
- **THEN** the system allows the selection (down to a minimum gap of 0.1 seconds between start and end) and saving it produces a clip of that short duration, not silently rounding up to 1 second or rejecting the selection

#### Scenario: Trim handles are keyboard-operable
- **WHEN** a Clipador focuses a trim handle (start or end) and presses ArrowLeft or ArrowRight
- **THEN** the system moves that handle by 0.1 seconds per press (in the corresponding direction), respecting the same minimum-gap and duration bounds as dragging

#### Scenario: Keyboard coarse nudge
- **WHEN** a Clipador holds Shift while pressing ArrowLeft or ArrowRight on a focused trim handle
- **THEN** the system moves that handle by 1 second per press instead of 0.1, for faster coarse positioning before fine-tuning

#### Scenario: Sub-second precision reachable on mobile without relying on drag accuracy
- **WHEN** a Clipador on a touch device taps the +/- stepper next to `Início` or `Fim`
- **THEN** the system moves that boundary by 0.1 seconds per tap, giving the same precision a desktop keyboard nudge gives, without requiring a precise drag gesture on a small screen

#### Scenario: Invalid range is rejected
- **WHEN** a Clipador selects a start at or after the selected end, or a value outside the clip's own duration
- **THEN** the system rejects the trim with an inline error and does not modify the clip

#### Scenario: Preview does not persist
- **WHEN** a Clipador previews a selected range without confirming
- **THEN** the clip's stored file and metadata remain unchanged until "Salvar corte" is explicitly confirmed

#### Scenario: Cancel discards changes
- **WHEN** a Clipador opens the cut modal, adjusts the sliders, and clicks "Cancelar"
- **THEN** the system closes the modal without modifying the clip

#### Scenario: Silence removal is off by default
- **WHEN** a Clipador opens the cut modal
- **THEN** the "Remover silêncios (Jump Cut)" option starts unchecked, and saving the trim without checking it produces exactly the same result as before this capability existed (a plain start/end cut, no segments removed)

#### Scenario: Silence removal cuts out silent segments across the selected range
- **WHEN** a Clipador checks "Remover silêncios (Jump Cut)" and confirms "Salvar corte"
- **THEN** the system detects silent segments throughout the selected `[start, end)` range and removes both the video and audio of each one from the saved clip (a real jump cut, not just muting audio under unchanged video), keeping brief padding around each cut so speech is not clipped, and the clip's duration shown in the library reflects the actual shorter output, not the selected range's raw length

#### Scenario: Selected range with no silence is unaffected by the toggle
- **WHEN** a Clipador checks "Remover silêncios (Jump Cut)" but the selected range contains no silent segment long enough to qualify
- **THEN** the saved clip is the same as a plain trim of that range — nothing is removed

#### Scenario: Selected range is almost entirely silent
- **WHEN** a Clipador checks "Remover silêncios (Jump Cut)" on a selected range where silence removal would leave little to no speech content
- **THEN** the system rejects the trim with a clear error instead of saving a near-empty or empty clip
