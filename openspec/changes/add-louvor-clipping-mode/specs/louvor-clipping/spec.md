## Purpose

Extracts worship-music (louvor) clips from a full church-service recording: it locates only the worship portions of the service, produces one clip per complete song plus short highlight clips of each song's strongest moments, all in vertical 9:16, while reusing the execution safety, queue, and output conventions already validated for the other pipelines.

## ADDED Requirements

### Requirement: Only the worship portions of a full service are clipped

The system SHALL classify each portion of a full church-service recording by service phase (abertura, avisos, dízimo/oferta, louvor, pregação, encerramento) and SHALL produce clips only from portions classified as `louvor` — the exact inverse of the Shorts pipeline's phase filter. Sung worship led by the band/worship team counts as `louvor`; spoken prayer, preaching, announcements, and offering appeals between songs SHALL NOT be included in any clip's selected span beyond the song's own natural intro/outro.

#### Scenario: Preaching and announcements are never clipped
- **WHEN** the louvor pipeline processes a full service containing worship, announcements, an offering appeal, and a sermon
- **THEN** every output clip's span falls inside a portion classified as `louvor`, and no clip is produced from the sermon, announcements, offering, opening, or closing

#### Scenario: A service with no worship produces no clips without failing
- **WHEN** the louvor pipeline processes a video in which no portion is classified as `louvor`
- **THEN** the system produces no clips, archives the original, releases the shared lock, and ends the run successfully (not as an execution error) with a message explaining that no worship was found

### Requirement: One clip per complete song

The system SHALL identify each distinct song within the worship portions and produce one clip per song spanning from the song's start to its end, named after the song when its title can be recognized from the lyrics. A full-song clip SHALL NOT be subject to the 180-second Shorts cap, but SHALL be at least 60 seconds long; a candidate shorter than that SHALL NOT be produced as a full-song clip.

#### Scenario: Each song becomes its own clip
- **WHEN** the worship portion of a service contains four distinct songs in sequence
- **THEN** the system produces four full-song clips, each starting at its song's beginning and ending at its song's end, with no two full-song clips overlapping

#### Scenario: A long song is kept whole
- **WHEN** a song lasts longer than 180 seconds
- **THEN** its full-song clip still spans the entire song instead of being truncated to 180 seconds

#### Scenario: A fragment too short to be a song is not emitted as one
- **WHEN** a detected song candidate spans less than 60 seconds (e.g. a short musical transition)
- **THEN** the system does not produce a full-song clip for it

### Requirement: Highlight Shorts of the strongest moments of each song

In addition to full-song clips, the system SHALL produce short highlight clips of the strongest worship moments (e.g. a chorus, a climax, a spontaneous congregational moment), applying the same per-clip duration bounds (30–180 seconds), minimum gap between consecutive highlight clips, and start/end boundary snapping already used by the Shorts pipeline. A highlight clip SHALL lie within a single song's span.

#### Scenario: Highlight clip stays within its song
- **WHEN** the system selects a highlight moment from a song
- **THEN** the highlight clip's span is contained within that song's full-song span and lasts between 30 and 180 seconds

#### Scenario: Oversized highlight candidate is not produced as proposed
- **WHEN** the AI proposes a highlight span longer than 180 seconds
- **THEN** the system does not produce that highlight clip as proposed, the same way the Shorts pipeline handles an oversized candidate

#### Scenario: Consecutive highlight clips keep a minimum gap
- **WHEN** two highlight candidates would be closer together than the pipeline's configured minimum gap
- **THEN** the system enforces that minimum gap between the two output highlight clips

### Requirement: Louvor clips are cropped to vertical 9:16 and keep the music intact

The system SHALL crop every louvor clip — full-song and highlight alike — to a 9:16 vertical frame using a fixed center crop, and SHALL NOT apply any audio filter that attenuates music (unlike the Palavra Completa pipeline's speech-focused filter), since the music is the content.

#### Scenario: Landscape service recording produces vertical clips
- **WHEN** the louvor pipeline cuts any clip from a landscape-recorded service
- **THEN** the output clip is cropped to a 9:16 vertical frame centered horizontally on the source frame

#### Scenario: Music is not filtered out
- **WHEN** the louvor pipeline cuts a clip
- **THEN** the output audio preserves the full musical content of the source, with no high-pass/low-pass speech filter applied

### Requirement: Each louvor clip's metadata identifies its kind

The system SHALL write, alongside every louvor clip, a metadata file carrying the same fields the other pipelines write (title, start/end and the real start/end actually cut) plus a field identifying the clip's kind as either a full song or a highlight.

#### Scenario: Full-song and highlight clips are distinguishable from metadata
- **WHEN** the louvor pipeline uploads a full-song clip and a highlight clip from the same song
- **THEN** each clip's metadata file identifies its kind, so a consumer can tell the full song from the highlight without inspecting the video

### Requirement: Louvor pipeline shares the VPS execution lock with the other pipelines

The system SHALL acquire the same shared execution lock the Shorts, Palavra Completa, and Podcast pipelines use before starting transcription, and SHALL NOT transcribe concurrently with any of them on the same VPS. The lock SHALL be released on every terminal path of a run that acquired it, including the "no worship found" path.

#### Scenario: Lock held by another pipeline defers louvor processing without failing
- **WHEN** the louvor pipeline's check finds the shared lock already held by another pipeline
- **THEN** the system ends that check successfully (no error), leaving the queued video in place for a later check

#### Scenario: Louvor pipeline holding the lock defers the other pipelines
- **WHEN** the louvor pipeline is transcribing a video and holds the shared lock
- **THEN** a check from any other pipeline ends successfully without starting a second concurrent transcription

### Requirement: Louvor output lands in its own queue, output, and archive folders

The system SHALL scan a dedicated queue folder (`Videos-Cortes/Louvor`) for louvor source videos, upload resulting clips and metadata to a dedicated output folder (`Videos-Cortes/Louvor/Cortes`), and archive each processed source video to a dedicated archive folder (`Videos-Cortes/Louvor/Videos`), all separate from the folders the other pipelines use, and SHALL continue automatically to the next queued louvor video after finishing one.

#### Scenario: Louvor video is discovered and processed from its own queue
- **WHEN** a video file is placed in `Videos-Cortes/Louvor`
- **THEN** the louvor pipeline discovers it on its own schedule (or when prompted), processes it, and no other pipeline picks it up

#### Scenario: Louvor queue empties automatically after processing
- **WHEN** the louvor pipeline finishes a video (clips uploaded, original archived)
- **THEN** the system automatically continues to the next eligible video in `Videos-Cortes/Louvor` if one exists, the same self-chaining behavior the other pipelines have
