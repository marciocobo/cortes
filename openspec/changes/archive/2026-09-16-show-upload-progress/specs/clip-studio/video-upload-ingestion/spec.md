## ADDED Requirements

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
