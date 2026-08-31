## Purpose

Gives the Clipador (and Admin) a YouTube-style library of the clips already produced by the n8n pipeline, with rename, delete, and download actions, sourced from the pipeline's OneDrive output rather than any direct upload.

## Requirements

### Requirement: Clip library listing
The system SHALL list every generated clip from the `Videos-Cortes/Cortes` OneDrive folder as a card showing at minimum the clip's display name and its duration, matching the metadata already written by the n8n pipeline's `_meta.json` files (`start`/`end`, or `real_start`/`real_end` when present).

#### Scenario: Library reflects pipeline output
- **WHEN** the n8n pipeline uploads a new clip (`.mp4`) and its matching `_meta.json` to `Videos-Cortes/Cortes`
- **THEN** the clip appears in the Clipador's video library on the next load, with its duration computed from `real_end - real_start` when both are present, falling back to `end - start` otherwise

#### Scenario: Clip missing metadata is not fatal
- **WHEN** a `.mp4` exists in `Videos-Cortes/Cortes` without a matching `_meta.json` (or vice versa)
- **THEN** the system still renders the library without erroring, showing what it can determine (e.g. file name in place of a missing title) rather than omitting the whole list

### Requirement: Rename clip
The system SHALL let a Clipador or Admin rename a clip's display name without altering the underlying `_meta.json` fields the n8n pipeline itself produced (`hook`, `reason`, timestamps, etc.).

#### Scenario: Rename succeeds
- **WHEN** a Clipador submits a new non-empty name for a clip
- **THEN** the system updates the clip's display name and the change is visible on the next library load

### Requirement: Delete clip
The system SHALL let a Clipador or Admin permanently delete a clip (its `.mp4` and its `_meta.json`) from OneDrive after explicit confirmation.

#### Scenario: Delete requires confirmation
- **WHEN** a Clipador clicks delete on a clip
- **THEN** the system shows a confirmation step before deleting, and does not delete anything if the user cancels

#### Scenario: Delete removes both files
- **WHEN** a Clipador confirms deletion of a clip
- **THEN** the system removes both the clip's `.mp4` and its `_meta.json` from OneDrive, and the clip no longer appears in the library on the next load

### Requirement: Download clip
The system SHALL let a Clipador or Admin download the original clip file for any clip present in the library.

#### Scenario: Download available clip
- **WHEN** a Clipador clicks "Baixar" on a clip whose `.mp4` exists in OneDrive
- **THEN** the system streams the clip file to the user's browser

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

### Requirement: Clip status indicator
The system SHALL show a status indicator on each clip card: `Original` when the clip has never been manually trimmed, `Cortado` once a trim has been saved for that clip, and `Rascunho` while the Clipador has an unsaved trim selection open for that clip on the current device.

#### Scenario: Untouched clip shows Original
- **WHEN** a clip's metadata has no record of a manual trim
- **THEN** its card shows the `Original` status

#### Scenario: Saved trim shows Cortado
- **WHEN** a Clipador saves a trim for a clip (per "Trim (re-cut) clip")
- **THEN** that clip's card shows the `Cortado` status on the next load, on any device

#### Scenario: Unsaved trim shows Rascunho on the same device
- **WHEN** a Clipador changes the start/end sliders in the cut modal without saving, then closes or leaves the modal open
- **THEN** that clip's card shows the `Rascunho` status on the same browser/device, until the trim is saved or explicitly cancelled

### Requirement: No direct video upload in the library
The video library SHALL NOT offer a way to add a new video by direct file upload; every clip in the library originates from the n8n pipeline processing a video submitted through `clip-studio/youtube-ingestion`.

#### Scenario: No upload control rendered
- **WHEN** any user (any role) views the video library
- **THEN** the system renders no button or control that lets them upload a video file directly into the library
