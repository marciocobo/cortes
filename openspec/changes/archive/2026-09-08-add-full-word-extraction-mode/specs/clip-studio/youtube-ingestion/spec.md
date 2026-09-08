## MODIFIED Requirements

### Requirement: Submit a YouTube link
The system SHALL let an Uploader or Admin submit a YouTube video URL, a title, and a processing mode (`Shorts` or `Palavra Completa`, defaulting to `Shorts` when not explicitly changed), validate the URL is a well-formed YouTube link before accepting it, and create a submission record carrying the chosen mode.

#### Scenario: Valid link accepted
- **WHEN** an Uploader submits a well-formed YouTube URL, a non-empty title, and a mode
- **THEN** the system creates a submission record with status `Na fila`, the chosen mode stored on the record, and it enters the download queue

#### Scenario: Malformed link rejected
- **WHEN** an Uploader submits a URL that is not a recognizable YouTube video link
- **THEN** the system rejects the submission with a clear error and does not create a submission record

#### Scenario: Mode defaults to Shorts
- **WHEN** an Uploader submits a link without changing the mode toggle
- **THEN** the system creates the submission with mode `Shorts`, identical to the behavior before this mode existed

### Requirement: Download hands off to the existing pipeline unchanged
The system SHALL fetch the submitted video and, depending on the submission's mode, place it into the OneDrive location the corresponding pipeline scans — `Videos-Cortes` for mode `Shorts` (scanned by the existing "Blocos" pipeline) or `Videos-Cortes/PalavraCompleta` for mode `Palavra Completa` (scanned by the "Palavra Completa" pipeline) — without adding, removing, or reconfiguring any node in the "Blocos" pipeline workflow itself. Each pipeline continues to discover, lock, and process videos exactly as it does today, regardless of how the file arrived in its folder.

#### Scenario: Download succeeds and file reaches the pipeline's folder
- **WHEN** a submission's download completes successfully
- **THEN** the system places the video file in the OneDrive folder matching its mode (`Videos-Cortes` for `Shorts`, `Videos-Cortes/PalavraCompleta` for `Palavra Completa`) using a file name that cannot collide with any other submission's file, updates the submission status to `Processando`, and prompts the corresponding pipeline to start rather than waiting for its next scheduled check

#### Scenario: Download succeeds and file reaches the Palavra Completa pipeline's folder
- **WHEN** a submission with mode `Palavra Completa` completes its download
- **THEN** the system places the video file in `Videos-Cortes/PalavraCompleta` using a file name that cannot collide with any other submission's file, updates the submission status to `Processando`, and prompts the "Palavra Completa" pipeline to start rather than waiting for its next scheduled check

#### Scenario: Download fails
- **WHEN** fetching the submitted URL fails (e.g. the video is private, deleted, or region-blocked)
- **THEN** the system marks the submission status `Erro`, records a human-readable reason, and does not place any partial file in either pipeline's folder

#### Scenario: Existing pipeline behavior is unchanged
- **WHEN** a video placed by this capability is picked up by the pipeline matching its mode
- **THEN** the pipeline processes it through the exact same nodes, locking, and fallback behavior it already uses for videos placed in its folder by any other means

#### Scenario: Existing "Blocos" pipeline behavior is unchanged
- **WHEN** a video placed by this capability in mode `Shorts` is picked up by the "Blocos" pipeline
- **THEN** the pipeline processes it through the exact same nodes, locking, and fallback behavior it already uses for videos placed in `Videos-Cortes` by any other means

### Requirement: Submission status tracking
The system SHALL track and display each submission's status as it progresses through `Na fila` → `Baixando` → `Processando` → `Concluído`, or to `Erro` at any step, reflecting the real state of the download and of whichever pipeline (Shorts or Palavra Completa) is processing that submission's mode.

#### Scenario: Status reflects real pipeline completion
- **WHEN** the pipeline matching a submission's mode finishes processing its video (clips/clip uploaded and the original archived, in the location that pipeline uses)
- **THEN** the system updates that submission's status to `Concluído`

#### Scenario: Status reflects real Shorts pipeline completion
- **WHEN** the "Blocos" pipeline finishes processing a video submitted with mode `Shorts` (its clips are uploaded to `Videos-Cortes/Cortes` and the original is archived to `Videos-Cortes/Videos`)
- **THEN** the system updates that submission's status to `Concluído`

#### Scenario: Status reflects real Palavra Completa pipeline completion
- **WHEN** the "Palavra Completa" pipeline finishes processing a video submitted with mode `Palavra Completa` (its single clip is uploaded to `Videos-Cortes/PalavraCompleta/Cortes` and the original is archived to `Videos-Cortes/PalavraCompleta/Videos`)
- **THEN** the system updates that submission's status to `Concluído`

#### Scenario: Status does not get stuck silently
- **WHEN** a submission stays `Processando` well beyond the time its pipeline's run is expected to take, with no sign of completion or archival in the location matching its mode
- **THEN** the system updates that submission's status to `Erro` with a reason, instead of leaving it stuck at `Processando` indefinitely
