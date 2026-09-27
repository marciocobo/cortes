## MODIFIED Requirements

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

## ADDED Requirements

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
