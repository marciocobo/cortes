## Purpose

Lets an Uploader (or Admin) submit a full YouTube video link, have it downloaded and queued into the existing n8n pipeline's input folder one at a time (without modifying that pipeline), and track the resulting processing status on screen.

## Requirements

### Requirement: Submit a YouTube link
The system SHALL let an Uploader or Admin submit a YouTube video URL and a title, validate the URL is a well-formed YouTube link before accepting it, and create a submission record.

#### Scenario: Valid link accepted
- **WHEN** an Uploader submits a well-formed YouTube URL and a non-empty title
- **THEN** the system creates a submission record with status `Na fila` and it enters the download queue

#### Scenario: Malformed link rejected
- **WHEN** an Uploader submits a URL that is not a recognizable YouTube video link
- **THEN** the system rejects the submission with a clear error and does not create a submission record

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
The system SHALL fetch the submitted video and place it into the same OneDrive folder (`Videos-Cortes`) that the n8n pipeline already scans, without adding, removing, or reconfiguring any node in the existing "Blocos" pipeline workflow — the pipeline continues to discover, lock, and process videos exactly as it does today, regardless of how the file arrived in that folder.

#### Scenario: Download succeeds and file reaches the pipeline's folder
- **WHEN** a submission's download completes successfully
- **THEN** the system places the video file in `Videos-Cortes` using a file name that cannot collide with any other submission's file, updates the submission status to `Processando`, and prompts the pipeline to start rather than waiting for its next scheduled check

#### Scenario: Download fails
- **WHEN** fetching the submitted URL fails (e.g. the video is private, deleted, or region-blocked)
- **THEN** the system marks the submission status `Erro`, records a human-readable reason, and does not place any partial file in `Videos-Cortes`

#### Scenario: Existing pipeline behavior is unchanged
- **WHEN** a video placed by this capability is picked up by the pipeline
- **THEN** the pipeline processes it through the exact same nodes, locking, and fallback behavior it already uses for videos placed in `Videos-Cortes` by any other means

### Requirement: Submission status tracking
The system SHALL track and display each submission's status as it progresses through `Na fila` → `Baixando` → `Processando` → `Concluído`, or to `Erro` at any step, reflecting the real state of the download and the pipeline rather than a simulated/timed progression.

#### Scenario: Status reflects real pipeline completion
- **WHEN** the pipeline finishes processing a video that was submitted through this capability (its clips are uploaded to `Videos-Cortes/Cortes` and the original is archived)
- **THEN** the system updates that submission's status to `Concluído`

#### Scenario: Status does not get stuck silently
- **WHEN** a submission stays `Processando` well beyond the time a pipeline run is expected to take, with no sign of completion or archival
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
