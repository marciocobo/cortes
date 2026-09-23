## MODIFIED Requirements

### Requirement: Detect a usable face position for a clip's time range

The system SHALL accept a source video and a clip's time range and return a horizontal crop position for each distinct camera-angle segment detected within that range, so the caller can center the 9:16 crop on a person rather than the raw frame's midpoint - and keep following whoever is on-screen even when the source recording cuts to a different camera angle partway through the clip. When more than one face is present in a segment, the position SHALL be centered on whichever face is genuinely talking, and that choice SHALL NOT be swayed by a face whose mouth is occluded, by non-speaking movement near a face, by how easy a face is to detect relative to others, or by a person touching their own mouth without speaking.

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

#### Scenario: A non-speaking person occluding their own mouth does not win the active-speaker choice
- **WHEN** a segment has two or more detectable faces, one person is genuinely talking, and another person is moving something (a hand, a tissue, an object) over or near their own mouth without speaking, sustained across most or all of the segment's samples
- **THEN** the service centers the crop position on the person who is genuinely talking, not on the person whose face is occluded by non-speaking movement

#### Scenario: An occluded mouth is treated as unmeasured, not as movement
- **WHEN** a detected face's mouth cannot be measured for a given sample (e.g. occluded by a hand, an object, or a bad angle)
- **THEN** the system does not count that sample as either speech-movement or stillness for that face, and does not let it corrupt the face's overall talking assessment for the segment

#### Scenario: A passive, easy-to-detect face does not outrank a genuinely talking face with a few missed detections
- **WHEN** a segment has two or more detectable faces, one person is genuinely talking (and their gesturing/head movement causes a few of their samples to go undetected), and another person is sitting still and is detected in every sample but shows no genuine talk signal
- **THEN** the service centers the crop position on the person who is genuinely talking, not on the person who was merely easiest to detect consistently

#### Scenario: A person touching their own mouth without speaking does not register as talking
- **WHEN** a detected face's own hand or finger is touching or resting near that same person's mouth or chin for a given sample (e.g. a thinking or scratching gesture), regardless of whether facial landmarks are still nominally found for that sample
- **THEN** the system treats that sample as unmeasured for that face's talking assessment, the same as an occluded mouth, so the gesture cannot be counted as speech movement

#### Scenario: No candidate shows measurable talk signal in a multi-face segment
- **WHEN** a segment has two or more detectable faces and none of them shows any measurable talk signal across the segment's samples (e.g. a quiet beat where everyone on camera is listening, not talking)
- **THEN** the service reports that no usable position was found for that segment, distinctly from a request failure, instead of selecting a "winner" by detection count or motion alone, so the caller can reuse a neighboring segment's position

#### Scenario: A single detectable face is still selected during a quiet pause
- **WHEN** a segment contains only one detectable face and that face shows no measurable talk signal for the segment (e.g. a quiet pause with only one person in frame)
- **THEN** the service still returns a crop position centered on that face, since there is no other candidate to resolve ambiguity against

### Requirement: Camera-angle cuts within a clip get their own crop position

The system SHALL detect a camera-angle cut occurring partway through a clip's time range and compute a separate crop position for each resulting segment, rather than applying one position derived from the whole range across a cut it doesn't fit. Cut detection SHALL be sensitive to a change in framing or composition (such as a zoom or reframe within the same room and lighting), not only to a change in the overall color palette between frames.

#### Scenario: A cut from a wide shot to a close-up gets two segments
- **WHEN** the source recording cuts from a wide multi-person shot to a single-person close-up partway through the requested time range
- **THEN** the system returns at least two segments, each with its own crop position appropriate to what's on-screen during that segment

#### Scenario: A segment boundary does not fall mid-word
- **WHEN** the system determines segment boundaries from detected camera cuts
- **THEN** each segment's boundary aligns with the detected cut point (not an arbitrary fixed interval), so the resulting output clip's crop changes exactly when the source recording's camera angle changes

#### Scenario: Heavily-edited multi-camera content is not capped below its real number of cuts
- **WHEN** a clip's time range contains more distinct camera-angle changes than the system's configured cut limit would previously have allowed, because the content cuts between several visually similar camera setups (e.g. a multi-panelist roundtable with several similarly-lit shots)
- **THEN** the system retains enough of the real detected cuts that a segment does not span two physically different scenes under one static crop position, up to the system's per-clip cut limit

#### Scenario: A same-room zoom or reframe is detected as a cut
- **WHEN** the source recording's camera zooms or reframes (e.g. from a wide shot to a closer shot) within the same room and lighting, such that the overall color palette barely changes between the two framings but the composition/subject positioning changes substantially
- **THEN** the system detects this as a camera cut and starts a new segment at that point, rather than treating the zoom/reframe as a continuation of the prior segment
