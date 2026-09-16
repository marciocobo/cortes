## MODIFIED Requirements

### Requirement: Detect a usable face position for a clip's time range

The system SHALL accept a source video and a clip's time range and return a horizontal crop position for each distinct camera-angle segment detected within that range, so the caller can center the 9:16 crop on a person rather than the raw frame's midpoint - and keep following whoever is on-screen even when the source recording cuts to a different camera angle partway through the clip. When more than one face is present in a segment, the position SHALL be centered on whichever face is genuinely talking, and that choice SHALL NOT be swayed by a face whose mouth is occluded or by non-speaking movement near a face.

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
