## Purpose

Provides a face-detection service the podcast pipeline can call, outside the VPS's hardened ffmpeg/n8n image (which has no Python, no package manager, and no face-detection capability built in), to determine where in a landscape podcast frame the 9:16 crop should be centered so it keeps a visible face in frame instead of always cutting the geometric center.

## ADDED Requirements

### Requirement: Detect a usable face position for a clip's time range

The system SHALL accept a source video and a clip's time range (or a shorter interval within it) and return a horizontal crop position for a face detected within that range, so the caller can center the 9:16 crop on a person rather than the raw frame's midpoint.

#### Scenario: A single face is detected off-center
- **WHEN** the source video's frame in the requested time range contains exactly one detectable face, positioned left or right of the frame's geometric center
- **THEN** the service returns a horizontal crop position centered on that face

#### Scenario: Multiple faces are present
- **WHEN** the source video's frame in the requested time range contains more than one detectable face (e.g. two or three people seated side by side)
- **THEN** the service returns a single horizontal crop position that keeps at least one face fully in frame, rather than failing or returning an ambiguous result

#### Scenario: No face is detectable
- **WHEN** no face can be detected in the requested time range (e.g. camera angle, poor lighting, or nobody in frame)
- **THEN** the service reports that no usable position was found, distinctly from a request failure, so the caller can fall back to the fixed center crop

### Requirement: The pipeline never blocks on the detection service

The system SHALL treat a call to the face-detection service as best-effort: an unreachable service, a timeout, or an error response SHALL NOT fail, skip, or indefinitely delay the clip being cut - the caller falls back to the pipeline's existing fixed center crop in every such case.

#### Scenario: Detection service is unreachable
- **WHEN** the podcast pipeline cannot reach the face-detection service (e.g. the sidecar container is down)
- **THEN** the pipeline proceeds to cut the clip using the fixed center crop, without retrying indefinitely or failing the clip

#### Scenario: Detection takes too long
- **WHEN** the face-detection service does not respond within the pipeline's configured timeout for a clip
- **THEN** the pipeline proceeds to cut that clip using the fixed center crop instead of waiting further

### Requirement: Detection scope is limited to the podcast pipeline

The system SHALL only be called by the podcast workflow; the Shorts ("Blocos") and Palavra Completa pipelines SHALL continue using their existing fixed center crop unchanged, since a single centered speaker does not have the off-center framing problem this capability addresses.

#### Scenario: Shorts pipeline is unaffected
- **WHEN** the Shorts ("Blocos") pipeline cuts a clip
- **THEN** it uses the same fixed center crop it used before this capability existed, without calling the face-detection service
