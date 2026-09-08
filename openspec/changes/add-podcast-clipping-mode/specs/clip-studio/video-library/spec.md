## MODIFIED Requirements

### Requirement: Clip library listing
The system SHALL list every generated clip from `Videos-Cortes/Cortes` (Shorts), `Videos-Cortes/PalavraCompleta/Cortes` (Palavra Completa), and `Videos-Cortes/Podcast/Cortes` (Podcast) as a card showing at minimum the clip's display name, its duration, and — for a Palavra Completa or Podcast clip — a visual badge distinguishing it from a Short, matching the metadata already written by the corresponding n8n pipeline's `_meta.json` files (`start`/`end`, or `real_start`/`real_end` when present).

#### Scenario: Library reflects pipeline output
- **WHEN** the pipeline matching a clip's source uploads a new clip (`.mp4`) and its matching `_meta.json` to that pipeline's output folder
- **THEN** the clip appears in the Clipador's video library on the next load, with its duration computed from `real_end - real_start` when both are present, falling back to `end - start` otherwise

#### Scenario: Library reflects Shorts pipeline output
- **WHEN** the "Blocos" pipeline uploads a new clip (`.mp4`) and its matching `_meta.json` to `Videos-Cortes/Cortes`
- **THEN** the clip appears in the Clipador's video library on the next load, with its duration computed from `real_end - real_start` when both are present, falling back to `end - start` otherwise, and no Palavra Completa or Podcast badge

#### Scenario: Library reflects Podcast pipeline output
- **WHEN** the podcast pipeline uploads a new clip (`.mp4`) and its matching `_meta.json` to `Videos-Cortes/Podcast/Cortes`
- **THEN** the clip appears in the Clipador's video library on the next load, with the same duration computation, and a badge identifying it as a Podcast clip

#### Scenario: Clip missing metadata is not fatal
- **WHEN** a `.mp4` exists in any source folder without a matching `_meta.json` (or vice versa)
- **THEN** the system still renders the library without erroring, showing what it can determine (e.g. file name in place of a missing title) rather than omitting the whole list
