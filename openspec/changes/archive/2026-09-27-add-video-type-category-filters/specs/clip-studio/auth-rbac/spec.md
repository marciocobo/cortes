## MODIFIED Requirements

### Requirement: Role-gated access
Every account SHALL have exactly one role — Clipador, Uploader, or Admin — and the system SHALL enforce role permissions on both the UI (which tabs/actions render) and the API (server-side check on every request), never relying on the UI alone.

#### Scenario: Clipador permissions
- **WHEN** a user with role Clipador is authenticated
- **THEN** the system grants access to the video library (`clip-studio/video-library`) only, and denies access to the YouTube submission flow (`clip-studio/youtube-ingestion`) and the admin console (`clip-studio/admin-console`)

#### Scenario: Uploader permissions
- **WHEN** a user with role Uploader is authenticated
- **THEN** the system grants access only to the YouTube submission flow (`clip-studio/youtube-ingestion`) and denies access to the video library and the admin console

#### Scenario: Admin permissions
- **WHEN** a user with role Admin is authenticated
- **THEN** the system grants access to the video library, the YouTube submission flow, and the admin console, and the submission history shows every user's submissions, not just the Admin's own

#### Scenario: Video library is not scoped by owner
- **WHEN** a user with access to the video library (Clipador or Admin) loads it
- **THEN** the system lists every clip regardless of who submitted the original video, including clips whose original video was not submitted through Clip Studio (no per-owner filtering is applied to the library)

#### Scenario: API rejects unauthorized role
- **WHEN** a request to an API route reserved for a role the authenticated user does not have (e.g. an Uploader calling a video-delete endpoint, or a Clipador calling a submission endpoint) arrives
- **THEN** the system rejects the request with an authorization error and performs no side effect, regardless of what the client-side UI would have allowed
