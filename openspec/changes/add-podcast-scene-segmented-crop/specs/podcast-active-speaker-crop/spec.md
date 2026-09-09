## MODIFIED Requirements

### Requirement: Detect a usable face position for a clip's time range

The system SHALL accept a source video and a clip's time range and return a horizontal crop position for each distinct camera-angle segment detected within that range, so the caller can center the 9:16 crop on a person rather than the raw frame's midpoint - and keep following whoever is on-screen even when the source recording cuts to a different camera angle partway through the clip.

#### Scenario: A single face is detected off-center
- **WHEN** the source video's frame in the requested time range contains exactly one detectable face, positioned left or right of the frame's geometric center
- **THEN** the service returns a horizontal crop position centered on that face

#### Scenario: Multiple faces are present within one camera-angle segment
- **WHEN** a single camera-angle segment within the requested time range contains more than one detectable face (e.g. two or three people seated side by side)
- **THEN** the service returns one horizontal crop position for that segment that keeps at least one face fully in frame, rather than failing or returning an ambiguous result

#### Scenario: No face is detectable
- **WHEN** no face can be detected in the requested time range (e.g. camera angle, poor lighting, or nobody in frame)
- **THEN** the service reports that no usable position was found, distinctly from a request failure, so the caller can fall back to the fixed center crop

#### Scenario: A clip with no camera cut still returns one segment
- **WHEN** the requested time range is a single continuous camera-angle take with no detected cut
- **THEN** the service returns exactly one segment covering the whole requested time range, matching today's single-offset-per-clip behavior

## ADDED Requirements

### Requirement: Camera-angle cuts within a clip get their own crop position

The system SHALL detect a camera-angle cut occurring partway through a clip's time range and compute a separate crop position for each resulting segment, rather than applying one position derived from the whole range across a cut it doesn't fit.

#### Scenario: A cut from a wide shot to a close-up gets two segments
- **WHEN** the source recording cuts from a wide multi-person shot to a single-person close-up partway through the requested time range
- **THEN** the system returns at least two segments, each with its own crop position appropriate to what's on-screen during that segment

#### Scenario: A segment boundary does not fall mid-word
- **WHEN** the system determines segment boundaries from detected camera cuts
- **THEN** each segment's boundary aligns with the detected cut point (not an arbitrary fixed interval), so the resulting output clip's crop changes exactly when the source recording's camera angle changes
