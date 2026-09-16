# video-upload-ingestion Specification

## Purpose

Lets an Uploader (or Admin) submit a source video by uploading a file directly from the browser — for podcast episodes or pregações that are not published on YouTube — instead of always requiring a YouTube link, while feeding the same download-free queue, mode routing, and status tracking the YouTube-link path already provides.

## Requirements

### Requirement: Submit a video by direct file upload

The system SHALL let an Uploader or Admin submit a source video by uploading a video file directly (instead of a YouTube link), along with a title and a processing mode, and create a submission record from it that enters the same queue as a YouTube-link submission.

#### Scenario: Valid file upload accepted
- **WHEN** an Uploader selects a video file, a non-empty title, and a mode, and submits
- **THEN** the system creates a submission record with status `Na fila` and it enters the download-free queue for that mode's pipeline

#### Scenario: Non-video file rejected
- **WHEN** an Uploader selects a file that is not a recognizable video format
- **THEN** the system rejects the submission with a clear error and does not create a submission record

#### Scenario: Upload failure does not create a stuck submission
- **WHEN** the file transfer from the browser to the system fails partway through
- **THEN** the system does not create a submission record left in an indefinite in-progress state — either the upload completes and a submission is created, or it fails cleanly with an error the Uploader can retry

### Requirement: Uploaded file reaches the pipeline's queue folder without yt-dlp

The system SHALL deliver an uploaded video file to the OneDrive queue folder matching the submission's mode using the same upload-in-chunks mechanism already used elsewhere in the pipeline for large files, without invoking `yt-dlp` (there is no YouTube URL to download).

#### Scenario: Uploaded file reaches the mode-matching queue folder
- **WHEN** a file-upload submission's transfer completes successfully
- **THEN** the system places the video file in the OneDrive queue folder matching its mode, updates the submission status to `Processando`, and prompts the corresponding pipeline to start rather than waiting for its next scheduled check

#### Scenario: Large file upload does not fail solely due to size
- **WHEN** an Uploader submits a multi-gigabyte video file (typical of a full podcast episode or sermon recording)
- **THEN** the system transfers it successfully using the same chunked-upload approach already used for large files elsewhere in the pipeline, rather than failing due to a request-size limit

### Requirement: File-upload submissions share status tracking and history with link submissions

The system SHALL track and display a file-upload submission's status and history exactly like a YouTube-link submission, with no separate history table or status model.

#### Scenario: Uploaded submission appears in the same history table
- **WHEN** an Uploader views their submission history after submitting by file upload
- **THEN** the uploaded submission appears in the same history table as their link submissions, showing status and date the same way

### Requirement: Transfer progress is tracked while a direct file upload streams to the system

While a direct file upload's bytes are streaming from the browser into the system (before the file is handed off to the mode-matching pipeline), the system SHALL track how many bytes have been received relative to the total size of the upload, and persist that progress on the submission record at a bounded frequency (not on every byte or every network chunk).

#### Scenario: Progress advances as the upload streams in
- **WHEN** a direct file upload is in progress and more bytes have been received since the last persisted snapshot
- **THEN** the system updates the submission's persisted progress to reflect the new bytes-received total, within a bounded delay, without blocking or slowing the transfer itself

#### Scenario: Total size is known from the start
- **WHEN** an Uploader begins a direct file upload
- **THEN** the system captures the total size of the file being uploaded at the start of the transfer, so progress can be expressed as a fraction of a known total

#### Scenario: Progress is not tracked for YouTube-link submissions
- **WHEN** a submission is created from a YouTube link instead of a direct file upload
- **THEN** the system does not attempt to track or display byte-level transfer progress for it (its `Baixando` status is shown without a percentage, unchanged from today)

### Requirement: Upload progress is visible in the submission history

The system SHALL display the current transfer progress, as a percentage, for a direct-upload submission whose status is `Baixando` and whose total size is known, visible to anyone who can see that submission in the history table (not only the person who submitted it).

#### Scenario: Percentage shown while uploading
- **WHEN** a direct-upload submission has status `Baixando` and the system has a known total size and a persisted bytes-received progress for it
- **THEN** the submission history shows a percentage (bytes received / total size) alongside the `Baixando` status for that row

#### Scenario: Percentage not shown before a total size is known
- **WHEN** a direct-upload submission has status `Baixando` but the system has not yet captured a total size for it
- **THEN** the submission history shows the plain `Baixando` status without a percentage, rather than a misleading or zero value

#### Scenario: Progress display stops once the transfer leaves Baixando
- **WHEN** a submission's status changes away from `Baixando` (to `Processando`, `Concluído`, or `Erro`)
- **THEN** the submission history no longer shows a transfer percentage for that row, regardless of whatever progress value was last persisted

#### Scenario: A stalled upload is visible as stalled, not hidden
- **WHEN** a direct-upload submission's persisted progress has not advanced for longer than the system's normal update interval, while its status is still `Baixando`
- **THEN** the submission history continues showing the last known percentage rather than an error or a reset to zero, so a stall is visible as "stuck at N%" rather than misrepresented as still actively climbing
