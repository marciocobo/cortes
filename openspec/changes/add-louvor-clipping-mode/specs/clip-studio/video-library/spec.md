## MODIFIED Requirements

### Requirement: Clip library listing
The system SHALL list every generated clip from `Videos-Cortes/Cortes` (Shorts), every generated clip from `Videos-Cortes/PalavraCompleta/Cortes` (Palavra Completa), every generated clip from `Videos-Cortes/Podcast/Cortes` (Podcast), and every generated clip from `Videos-Cortes/Louvor/Cortes` (Louvor) as a card showing at minimum the clip's display name, its duration, a content-type badge (`Pregação`, `Louvor`, or `Podcast`, derived from the source folder the clip was uploaded to), and — for a Palavra Completa clip, or for a Louvor full-song clip — an additional badge distinguishing it from a short highlight clip, matching the metadata already written by the corresponding n8n pipeline's `_meta.json` files (`start`/`end`, or `real_start`/`real_end` when present). A clip from `Videos-Cortes/Cortes` or `Videos-Cortes/PalavraCompleta/Cortes` classifies as content type `Pregação`; a clip from `Videos-Cortes/Podcast/Cortes` classifies as `Podcast`; a clip from `Videos-Cortes/Louvor/Cortes` classifies as `Louvor`.

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

#### Scenario: Library reflects Louvor pipeline output
- **WHEN** the louvor pipeline uploads a full-song clip and a highlight clip (`.mp4`) with their matching `_meta.json` to `Videos-Cortes/Louvor/Cortes`
- **THEN** both clips appear in the Clipador's video library on the next load, with the same duration computation, classified as content type `Louvor`, and only the full-song clip carries an additional "Música completa" badge

#### Scenario: No clip classifies as Louvor yet
- **WHEN** a Clipador views the video library while `Videos-Cortes/Louvor/Cortes` contains no clip yet (e.g. before the first louvor video is processed, or the folder does not exist yet)
- **THEN** no clip in the library classifies as content type `Louvor`, and the library renders without error (the `Louvor` filter, once selected, simply shows no results)

#### Scenario: Clip missing metadata is not fatal
- **WHEN** a `.mp4` exists in any source folder without a matching `_meta.json` (or vice versa)
- **THEN** the system still renders the library without erroring, showing what it can determine (e.g. file name in place of a missing title) rather than omitting the whole list
