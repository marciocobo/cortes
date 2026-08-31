## ADDED Requirements

### Requirement: YouTube cookie re-bootstrap
The system SHALL let an Admin submit a fresh YouTube session cookie (Netscape-format `cookies.txt` content) from the Configurações screen, forward it to the ingestion pipeline's cookie-refresh service, and report back a single validated result reflecting whether a real download would actually succeed with it — not just whether the submission was accepted — and SHALL restrict this to the Admin role only.

#### Scenario: Admin submits a working cookie
- **WHEN** an Admin submits `cookies.txt` content for an account whose session is still valid
- **THEN** the system reports success only after confirming the cookie works against a real download probe, not merely that it was accepted

#### Scenario: Bootstrap accepted but the cookie doesn't actually work
- **WHEN** an Admin submits `cookies.txt` content that the cookie-refresh service accepts (looks logged-in) but that fails the real download probe
- **THEN** the system reports failure with the probe's actual reason, not a false success

#### Scenario: Malformed or empty cookie file rejected
- **WHEN** an Admin submits content that is not a valid non-empty Netscape cookies file
- **THEN** the system reports a clear error and does not report success

#### Scenario: Non-admin cannot re-bootstrap the cookie
- **WHEN** a Clipador or Uploader attempts to submit a cookie, whether through the UI or by calling the API directly
- **THEN** the system denies the request
