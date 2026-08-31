## MODIFIED Requirements

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

## ADDED Requirements

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
