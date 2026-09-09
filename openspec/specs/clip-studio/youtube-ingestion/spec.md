## Purpose

Lets an Uploader (or Admin) submit a full YouTube video link, have it downloaded and queued into the existing n8n pipeline's input folder one at a time (without modifying that pipeline), and track the resulting processing status on screen.

## Requirements

### Requirement: Submit a YouTube link
The system SHALL let an Uploader or Admin submit a YouTube video URL, a title, and a processing mode (`Shorts`, `Palavra Completa`, or `Podcast`, defaulting to `Shorts` when not explicitly changed), validate the URL is a well-formed YouTube link before accepting it, and create a submission record carrying the chosen mode.

#### Scenario: Valid link accepted
- **WHEN** an Uploader submits a well-formed YouTube URL, a non-empty title, and a mode
- **THEN** the system creates a submission record with status `Na fila`, the chosen mode stored on the record, and it enters the download queue

#### Scenario: Malformed link rejected
- **WHEN** an Uploader submits a URL that is not a recognizable YouTube video link
- **THEN** the system rejects the submission with a clear error and does not create a submission record

#### Scenario: Mode defaults to Shorts
- **WHEN** an Uploader submits a link without changing the content-type selector or mode toggle
- **THEN** the system creates the submission with mode `Shorts`, identical to the behavior before these modes existed

#### Scenario: Content type selector determines the mode family
- **WHEN** an Uploader selects content type `Pregação`
- **THEN** the system offers the existing `Modo Palavra Completa` toggle, and the submission's mode is `Shorts` or `Palavra Completa` depending on that toggle

#### Scenario: Selecting Podcast content type sets the Podcast mode
- **WHEN** an Uploader selects content type `Podcast`
- **THEN** the system does not offer the `Modo Palavra Completa` toggle (it does not apply to podcast content) and the submission's mode is `Podcast`

### Requirement: Downloads run one at a time, in submission order
The system SHALL download submitted videos sequentially — never more than one download in progress at a time — processing queued submissions in queue order (a submission's `Na fila` position is determined by when it most recently entered the queue, whether from first submission or from a later reprocess), so videos land in the pipeline's input folder one by one, the same way a manual upload would today.

#### Scenario: Second submission waits for the first
- **WHEN** an Uploader submits a second link while an earlier submission is still `Baixando`
- **THEN** the system keeps the second submission at status `Na fila` and does not start its download until the first submission's download has finished (successfully or with error)

#### Scenario: A failed download does not block the queue
- **WHEN** a queued submission's download ends in error
- **THEN** the system immediately starts the next `Na fila` submission's download instead of waiting or stopping the queue

#### Scenario: A reprocessed submission queues behind submissions already waiting
- **WHEN** a submission is reprocessed (see "Reprocess a failed submission") while one or more other submissions are already `Na fila`
- **THEN** the reprocessed submission's download starts only after those already-queued submissions have been processed, not ahead of them

### Requirement: Download hands off to the existing pipeline unchanged
The system SHALL fetch the submitted video and, depending on the submission's mode, place it into the OneDrive location the corresponding pipeline scans — `Videos-Cortes` for mode `Shorts` (scanned by the existing "Blocos" pipeline), `Videos-Cortes/PalavraCompleta` for mode `Palavra Completa`, or `Videos-Cortes/Podcast` for mode `Podcast` — without adding, removing, or reconfiguring any node in the "Blocos" pipeline workflow itself. Each pipeline continues to discover, lock, and process videos exactly as it does today, regardless of how the file arrived in its folder.

#### Scenario: Download succeeds and file reaches the pipeline's folder
- **WHEN** a submission's download completes successfully
- **THEN** the system places the video file in the OneDrive folder matching its mode (`Videos-Cortes` for `Shorts`, `Videos-Cortes/PalavraCompleta` for `Palavra Completa`, `Videos-Cortes/Podcast` for `Podcast`) using a file name that cannot collide with any other submission's file, updates the submission status to `Processando`, and prompts the corresponding pipeline to start rather than waiting for its next scheduled check

#### Scenario: Download succeeds and file reaches the Palavra Completa pipeline's folder
- **WHEN** a submission with mode `Palavra Completa` completes its download
- **THEN** the system places the video file in `Videos-Cortes/PalavraCompleta` using a file name that cannot collide with any other submission's file, updates the submission status to `Processando`, and prompts the "Palavra Completa" pipeline to start rather than waiting for its next scheduled check

#### Scenario: Download succeeds and file reaches the Podcast pipeline's folder
- **WHEN** a submission with mode `Podcast` completes its download
- **THEN** the system places the video file in `Videos-Cortes/Podcast` using a file name that cannot collide with any other submission's file, updates the submission status to `Processando`, and prompts the podcast pipeline to start rather than waiting for its next scheduled check

#### Scenario: Download fails
- **WHEN** fetching the submitted URL fails (e.g. the video is private, deleted, or region-blocked)
- **THEN** the system marks the submission status `Erro`, records a human-readable reason, and does not place any partial file in any pipeline's folder

#### Scenario: Existing pipeline behavior is unchanged
- **WHEN** a video placed by this capability is picked up by the pipeline matching its mode
- **THEN** the pipeline processes it through the exact same nodes, locking, and fallback behavior it already uses for videos placed in its folder by any other means

#### Scenario: Existing "Blocos" pipeline behavior is unchanged
- **WHEN** a video placed by this capability in mode `Shorts` is picked up by the "Blocos" pipeline
- **THEN** the pipeline processes it through the exact same nodes, locking, and fallback behavior it already uses for videos placed in `Videos-Cortes` by any other means

### Requirement: Submission status tracking
The system SHALL track and display each submission's status as it progresses through `Na fila` → `Baixando` → `Processando` → `Concluído`, or to `Erro` at any step, reflecting the real state of the download and of whichever pipeline (Shorts, Palavra Completa, or Podcast) is processing that submission's mode.

#### Scenario: Status reflects real pipeline completion
- **WHEN** the pipeline matching a submission's mode finishes processing its video (clips/clip uploaded and the original archived, in the location that pipeline uses)
- **THEN** the system updates that submission's status to `Concluído`

#### Scenario: Status reflects real Shorts pipeline completion
- **WHEN** the "Blocos" pipeline finishes processing a video submitted with mode `Shorts` (its clips are uploaded to `Videos-Cortes/Cortes` and the original is archived to `Videos-Cortes/Videos`)
- **THEN** the system updates that submission's status to `Concluído`

#### Scenario: Status reflects real Palavra Completa pipeline completion
- **WHEN** the "Palavra Completa" pipeline finishes processing a video submitted with mode `Palavra Completa` (its single clip is uploaded to `Videos-Cortes/PalavraCompleta/Cortes` and the original is archived to `Videos-Cortes/PalavraCompleta/Videos`)
- **THEN** the system updates that submission's status to `Concluído`

#### Scenario: Status reflects real Podcast pipeline completion
- **WHEN** the podcast pipeline finishes processing a video submitted with mode `Podcast` (its clips are uploaded to `Videos-Cortes/Podcast/Cortes` and the original is archived to `Videos-Cortes/Podcast/Videos`)
- **THEN** the system updates that submission's status to `Concluído`

#### Scenario: Status does not get stuck silently
- **WHEN** a submission stays `Processando` well beyond the time its pipeline's run is expected to take, with no sign of completion or archival in the location matching its mode
- **THEN** the system updates that submission's status to `Erro` with a reason, instead of leaving it stuck at `Processando` indefinitely

### Requirement: Submission history
The system SHALL show a history table of past submissions (video, link, submitted by, date, status) to the Uploader who created them, and to Admin for every user's submissions.

#### Scenario: Uploader sees only their own history
- **WHEN** an Uploader views the submission history
- **THEN** the system shows only submissions that user created

#### Scenario: Admin sees every submission
- **WHEN** an Admin views the submission history
- **THEN** the system shows submissions from every user, with the submitter identified per row

### Requirement: Reprocess a failed submission
The system SHALL let the Uploader who created a submission, or an Admin, reprocess any submission whose status is `Erro` by re-queuing it for download without requiring re-entry of its title or link.

#### Scenario: Reprocess re-queues the same submission
- **WHEN** the Uploader who created an `Erro` submission (or an Admin) triggers reprocess on it
- **THEN** the system sets that submission's status to `Na fila`, using the same submission record (same title, link, and identity) rather than creating a new one

#### Scenario: Reprocess is only available on failed submissions
- **WHEN** a submission's status is `Na fila`, `Baixando`, `Processando`, or `Concluído`
- **THEN** the system does not offer a reprocess action for that submission

#### Scenario: Another Uploader cannot reprocess someone else's submission
- **WHEN** an Uploader (not Admin) attempts to reprocess an `Erro` submission created by a different user
- **THEN** the system rejects the action

### Requirement: Submission attempt history
The system SHALL preserve a record of each failed attempt on a submission — its status, error reason, and when it occurred — whenever that submission is reprocessed, so earlier failure reasons remain visible after a later attempt changes the submission's current status.

#### Scenario: Reprocessing snapshots the failed attempt before re-queuing
- **WHEN** a submission with status `Erro` and a recorded error reason is reprocessed
- **THEN** the system records that status, error reason, and timestamp as a past attempt before changing the submission's status to `Na fila`

#### Scenario: Uploader or Admin views a submission's attempt history
- **WHEN** the Uploader who created a submission (or an Admin) opens that submission's attempt history from the submission history table
- **THEN** the system shows every recorded past attempt for that submission, each with its timestamp and error reason, ordered most recent first

#### Scenario: A submission with no past failures has an empty history
- **WHEN** a submission has never been reprocessed
- **THEN** its attempt history contains no past-attempt entries (only its current, in-progress state applies)

### Requirement: No webhook configuration on the Uploader screen
The Uploader's submission screen SHALL NOT expose the N8N webhook URL or any other pipeline configuration field; that configuration is Admin-only (see `clip-studio/admin-console`).

#### Scenario: Uploader screen has no webhook field
- **WHEN** an Uploader (not Admin) views the submission screen
- **THEN** the system renders no field for configuring the N8N webhook URL
