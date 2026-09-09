# podcast-clipping Specification

## Purpose

Extracts multiple short highlight clips from a podcast episode, using selection criteria suited to podcast content (strong insight, humor, a revelation, a debate/counterpoint, a quotable line) instead of the sermon-phase filter the existing pipelines use, while reusing the same execution safety, timing-correction, and output conventions already validated in production.

## Requirements

### Requirement: Podcast highlight selection uses podcast-specific criteria, not the sermon-phase filter

The system SHALL score and select podcast clips using criteria for highlight-worthiness (e.g. a strong insight, humor, a revelation, a debate/counterpoint, a quotable line) instead of the sermon-phase exclusion filter (abertura/avisos/dízimo/louvor/encerramento) the Shorts and Palavra Completa pipelines use, and SHALL NOT apply that sermon-phase filter to podcast content.

#### Scenario: A segment with no sermon-phase equivalent is still evaluated on its own merits
- **WHEN** the podcast pipeline scores a segment that contains banter, an advertisement/sponsor read, or a guest introduction (none of which map to a sermon phase)
- **THEN** the system scores it purely on podcast highlight criteria (does not reject or floor its score merely for resembling a non-pregação sermon phase, since that filter does not apply here)

#### Scenario: A genuinely low-value segment (ad read, pure banter) still scores low
- **WHEN** a segment is a sponsor/advertisement read or off-topic banter with no discernible insight, humor, or quotable content
- **THEN** the system scores it low under the podcast highlight criteria, keeping it out of the final selection on its own merits rather than through a phase-based exclusion rule

### Requirement: Podcast clips follow the same duration, gap, and boundary-safety rules as Shorts

The system SHALL apply the same per-clip duration bounds (30–180 seconds), minimum gap between consecutive clips, and silence-based start/end snapping already used by the Shorts ("Blocos") pipeline, so podcast clips do not start or end mid-sentence any more than Shorts clips do today.

#### Scenario: Oversized candidate is rejected or trimmed to the cap
- **WHEN** the AI proposes a podcast clip whose selected span is longer than 180 seconds
- **THEN** the system does not produce that clip as proposed — matching how the Shorts pipeline already handles an oversized candidate

#### Scenario: Consecutive clips keep a minimum gap
- **WHEN** two podcast highlight candidates would otherwise be closer together than the pipeline's configured minimum gap
- **THEN** the system enforces that minimum gap between the two output clips, the same way the Shorts pipeline does

### Requirement: Podcast clips are cropped to vertical 9:16, like Shorts

The system SHALL crop podcast clips to a 9:16 vertical frame, matching the Shorts pipeline's output format, so podcast highlights are directly usable as short-form social video without a separate conversion step.

#### Scenario: Landscape source produces a vertical clip
- **WHEN** the podcast pipeline cuts a clip from a landscape-recorded source video
- **THEN** the output clip file is cropped to a 9:16 vertical frame, the same convention the Shorts pipeline already applies

### Requirement: Podcast pipeline shares the VPS execution lock with Shorts and Palavra Completa

The system SHALL acquire the same shared execution lock the Shorts and Palavra Completa pipelines already use before starting transcription, and SHALL NOT run its own transcription concurrently with either of the other two pipelines on the same VPS.

#### Scenario: Lock held by another pipeline defers podcast processing without failing
- **WHEN** the podcast pipeline's scheduled check finds the shared lock already held by Shorts or Palavra Completa
- **THEN** the system ends that check successfully (no error), leaving the queued podcast video in place for a later check once the lock is free

#### Scenario: Podcast pipeline holding the lock defers the other pipelines
- **WHEN** the podcast pipeline is transcribing a video and holds the shared lock
- **THEN** a scheduled or triggered check from Shorts or Palavra Completa ends successfully without starting a second concurrent transcription

### Requirement: Podcast output lands in its own queue and output folders

The system SHALL scan a dedicated queue folder for podcast source videos, upload resulting clips and their metadata to a dedicated podcast output folder, and archive each processed source video to a dedicated podcast archive folder — all separate from the folders Shorts and Palavra Completa already use.

#### Scenario: Podcast video is discovered and processed from its own queue
- **WHEN** a video file is placed in the podcast pipeline's queue folder
- **THEN** the pipeline discovers it on its own schedule (or when prompted), processes it, and does not require any change to how Shorts or Palavra Completa discover videos in their own folders

#### Scenario: Podcast queue empties automatically after processing
- **WHEN** the podcast pipeline finishes a video (clips uploaded, original archived)
- **THEN** the system automatically continues to the next eligible video in the podcast queue if one exists, without requiring manual intervention, the same self-chaining behavior Shorts and Palavra Completa already have
