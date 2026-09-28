## Purpose

Gives the Clipador (and Admin) a YouTube-style library of the clips already produced by the n8n pipeline, with rename, delete, and download actions, sourced from the pipeline's OneDrive output rather than any direct upload.

## Requirements

### Requirement: Clip library listing
The system SHALL list every generated clip from `Videos-Cortes/Cortes` (Shorts), every generated clip from `Videos-Cortes/PalavraCompleta/Cortes` (Palavra Completa), and every generated clip from `Videos-Cortes/Podcast/Cortes` (Podcast) as a card showing at minimum the clip's display name, its duration, a content-type badge (`Pregação`, `Louvor`, or `Podcast`, derived from the source folder the clip was uploaded to), and — for a Palavra Completa clip specifically — an additional badge distinguishing it from a Short, matching the metadata already written by the corresponding n8n pipeline's `_meta.json` files (`start`/`end`, or `real_start`/`real_end` when present). A clip from `Videos-Cortes/Cortes` or `Videos-Cortes/PalavraCompleta/Cortes` classifies as content type `Pregação`; a clip from `Videos-Cortes/Podcast/Cortes` classifies as `Podcast`. A `Videos-Cortes/Louvor/Cortes` source folder is reserved for content type `Louvor`, but no pipeline populates it yet as of this requirement, so no clip classifies as `Louvor` until a future capability adds one.

#### Scenario: Library reflects pipeline output
- **WHEN** the pipeline matching a clip's source uploads a new clip (`.mp4`) and its matching `_meta.json` to that pipeline's output folder
- **THEN** the clip appears in the Clipador's video library on the next load, with its duration computed from `real_end - real_start` when both are present, falling back to `end - start` otherwise

#### Scenario: Library reflects Shorts pipeline output
- **WHEN** the "Blocos" pipeline uploads a new clip (`.mp4`) and its matching `_meta.json` to `Videos-Cortes/Cortes`
- **THEN** the clip appears in the Clipador's video library on the next load, with its duration computed from `real_end - real_start` when both are present, falling back to `end - start` otherwise, classified as content type `Pregação`, and with no Palavra Completa badge

#### Scenario: Library reflects Palavra Completa pipeline output
- **WHEN** the "Palavra Completa" pipeline uploads its single clip (`.mp4`) and its matching `_meta.json` to `Videos-Cortes/PalavraCompleta/Cortes`
- **THEN** the clip appears in the Clipador's video library on the next load, with the same duration computation, classified as content type `Pregação`, and with an additional badge identifying it as a Palavra Completa clip

#### Scenario: Library reflects Podcast pipeline output
- **WHEN** the podcast pipeline uploads a new clip (`.mp4`) and its matching `_meta.json` to `Videos-Cortes/Podcast/Cortes`
- **THEN** the clip appears in the Clipador's video library on the next load, with the same duration computation and classified as content type `Podcast`

#### Scenario: No clip classifies as Louvor yet
- **WHEN** a Clipador views the video library before any pipeline uploads to `Videos-Cortes/Louvor/Cortes`
- **THEN** no clip in the library classifies as content type `Louvor`, and the library renders without error (the `Louvor` filter, once selected, simply shows no results)

#### Scenario: Clip missing metadata is not fatal
- **WHEN** a `.mp4` exists in any source folder without a matching `_meta.json` (or vice versa)
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

### Requirement: Filter clips by content type
The system SHALL let a Clipador or Admin filter the video library by content type (`Pregação`, `Louvor`, or `Podcast`), and SHALL require a content type to be selected before any clip is shown — the library starts with no clips visible and a prompt to select a type.

#### Scenario: No type selected shows a prompt, not clips
- **WHEN** a Clipador opens the video library without having selected a content type
- **THEN** the system shows no clip cards and a message prompting the Clipador to select a content type, instead of showing clips of every type or a default type

#### Scenario: Selecting a type shows its clips
- **WHEN** a Clipador selects a content type (e.g. `Pregação`)
- **THEN** the system shows every clip classified as that content type, across all statuses, unless a status filter (Categoria) is also selected

#### Scenario: Selecting a type with no matching clips
- **WHEN** a Clipador selects a content type for which no clip currently exists (e.g. `Louvor`, before any pipeline populates it)
- **THEN** the system shows a message that no video was found for that type, rather than an error or a blank/ambiguous grid

#### Scenario: Deselecting the active type clears the status filter too
- **WHEN** a Clipador clicks the currently-selected content type pill again to deselect it
- **THEN** the system clears both the content-type selection and any active status filter (Categoria), returning to the "select a type" prompt

### Requirement: Load clips on demand, per content type
The system SHALL NOT fetch any clip when the video library opens. It SHALL fetch clips only after a content type is selected, and only that content type's clips (every clip of the type, across all statuses). Once a content type's clips have been loaded, the system SHALL keep them in memory and reuse them when that type is selected again, instead of fetching them again.

#### Scenario: Opening the library fetches nothing
- **WHEN** a Clipador opens the video library
- **THEN** the system requests no clips from the server and shows the "select a type" prompt immediately, with no loading placeholder

#### Scenario: Selecting a type fetches only that type
- **WHEN** a Clipador selects a content type for the first time in the session
- **THEN** the system requests only that content type's clips, shows a loading placeholder until they arrive, and then shows all of them

#### Scenario: Reselecting an already-loaded type does not refetch
- **WHEN** a Clipador selects a content type, switches to another type, and then selects the first type again
- **THEN** the system shows the first type's clips immediately from memory, without a new request or a loading placeholder

#### Scenario: Refreshes reload only the selected type
- **WHEN** the library refreshes (the browser tab regains focus after the minimum refresh interval, or a clip is renamed, deleted, or trimmed)
- **THEN** the system reloads only the currently selected content type's clips, and does nothing when no content type is selected

#### Scenario: A failed load is retried on reselection
- **WHEN** loading a content type's clips fails and the Clipador selects that type again
- **THEN** the system requests that type's clips again instead of showing a cached empty result

### Requirement: Filter clips by status (Categoria), gated by content type
The system SHALL let a Clipador or Admin further filter the type-selected clip list by status (`Original`, `Cortado`, or `Processando`) under a filter row labeled "Categoria", and SHALL keep this filter's controls disabled and inert until a content type is selected.

#### Scenario: Categoria is disabled before a type is selected
- **WHEN** a Clipador has not yet selected a content type
- **THEN** the Categoria filter's status options are shown disabled, and selecting one has no effect

#### Scenario: Categoria filters within the selected type
- **WHEN** a Clipador has selected a content type and then selects a Categoria value (e.g. `Cortado`)
- **THEN** the system shows only clips of that content type whose status matches the selected Categoria value

#### Scenario: Clearing Categoria shows every status within the type
- **WHEN** a Clipador deselects the active Categoria value while a content type remains selected
- **THEN** the system shows every clip of that content type regardless of status
