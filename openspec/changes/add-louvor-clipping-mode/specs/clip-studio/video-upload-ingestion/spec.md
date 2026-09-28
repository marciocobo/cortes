## MODIFIED Requirements

### Requirement: Uploaded file reaches the pipeline's queue folder without yt-dlp

The system SHALL deliver an uploaded video file to the OneDrive queue folder matching the submission's mode using the same upload-in-chunks mechanism already used elsewhere in the pipeline for large files, without invoking `yt-dlp` (there is no YouTube URL to download). Every processing mode accepted by the YouTube-link path — including `Louvor` — SHALL also be accepted for a file-upload submission.

#### Scenario: Uploaded file reaches the mode-matching queue folder
- **WHEN** a file-upload submission's transfer completes successfully
- **THEN** the system places the video file in the OneDrive queue folder matching its mode, updates the submission status to `Processando`, and prompts the corresponding pipeline to start rather than waiting for its next scheduled check

#### Scenario: Large file upload does not fail solely due to size
- **WHEN** an Uploader submits a multi-gigabyte video file (typical of a full podcast episode or sermon recording)
- **THEN** the system transfers it successfully using the same chunked-upload approach already used for large files elsewhere in the pipeline, rather than failing due to a request-size limit

#### Scenario: Louvor file upload reaches the Louvor queue folder
- **WHEN** an Uploader selects content type `Louvor`, chooses "Enviar arquivo", and the transfer completes successfully
- **THEN** the system places the video file in `Videos-Cortes/Louvor`, updates the submission status to `Processando`, and prompts the louvor pipeline to start
