## Purpose

Lets an Uploader (or Admin) submit a source video by uploading a file directly from the browser — for podcast episodes or pregações that are not published on YouTube — instead of always requiring a YouTube link, while feeding the same download-free queue, mode routing, and status tracking the YouTube-link path already provides.

## ADDED Requirements

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
