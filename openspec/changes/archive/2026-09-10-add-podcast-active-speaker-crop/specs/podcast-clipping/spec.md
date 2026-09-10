## MODIFIED Requirements

### Requirement: Podcast clips are cropped to vertical 9:16, like Shorts

The system SHALL crop podcast clips to a 9:16 vertical frame, matching the Shorts pipeline's output format, so podcast highlights are directly usable as short-form social video without a separate conversion step. The horizontal position of that crop SHALL be informed by active-speaker face detection (see `podcast-active-speaker-crop`) rather than always being the frame's geometric center, so a clip keeps the person who is talking in frame even when the source video has multiple people seated side by side. When face detection is unavailable, times out, or finds no usable face for a clip, the system SHALL fall back to the fixed center crop it has always used, rather than failing or delaying that clip's processing.

#### Scenario: Landscape source produces a vertical clip
- **WHEN** the podcast pipeline cuts a clip from a landscape-recorded source video
- **THEN** the output clip file is cropped to a 9:16 vertical frame, the same convention the Shorts pipeline already applies

#### Scenario: Crop follows a detected speaker instead of the frame center
- **WHEN** the podcast pipeline cuts a clip from a source video where a detected face is off-center (e.g. two or three people seated side by side)
- **THEN** the output clip's horizontal crop window is positioned around the detected face rather than the raw frame's geometric center

#### Scenario: Face detection unavailable falls back to the fixed center crop
- **WHEN** the active-speaker detection sidecar is unreachable, times out, or returns no usable face for a clip
- **THEN** the system cuts that clip using the same fixed center crop formula the pipeline used before this capability existed, and does not fail, skip, or delay the clip on account of the missing detection
