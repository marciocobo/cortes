## MODIFIED Requirements

### Requirement: Trim (re-cut) clip
The system SHALL let a Clipador or Admin manually re-cut a clip's start/end within the clip's own current duration (shortening it), optionally also removing silent segments detected within that selected range (a "jump cut"), persisting the result to the clip's `.mp4` and `_meta.json`.

#### Scenario: Trim succeeds
- **WHEN** a Clipador selects a new start/end within the clip's current duration and confirms "Salvar corte"
- **THEN** the system re-cuts the clip's `.mp4` to the selected range, updates its metadata to reflect the new boundaries, and the clip's duration shown in the library reflects the new range on the next load

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
