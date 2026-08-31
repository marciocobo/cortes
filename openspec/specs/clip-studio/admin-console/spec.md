## Purpose

Gives the Admin role user/role management and N8N-related configuration, plus unrestricted visibility into every user's videos and submissions, without granting Clipador or Uploader any of this.

## Requirements

### Requirement: User management
The system SHALL let an Admin create a new user (email, initial password, role), change an existing user's role, and deactivate a user, and SHALL restrict all of this to the Admin role.

#### Scenario: Admin creates a user
- **WHEN** an Admin submits an email, initial password, and a role (Clipador, Uploader, or Admin) for a new user
- **THEN** the system creates the account with that role, and the new user can log in with those credentials

#### Scenario: Admin deactivates a user
- **WHEN** an Admin deactivates an existing user's account
- **THEN** that account can no longer log in (see `clip-studio/auth-rbac` deactivated-account scenario), and its existing sessions are invalidated

#### Scenario: Non-admin cannot manage users
- **WHEN** a Clipador or Uploader attempts to call the user-management API directly
- **THEN** the system rejects the request with an authorization error

### Requirement: N8N configuration
The system SHALL let an Admin view and update the N8N webhook/notification URL used by the backend, and SHALL restrict this setting to the Admin role only.

#### Scenario: Admin updates the webhook URL
- **WHEN** an Admin submits a new N8N webhook URL
- **THEN** the system persists it and uses it for subsequent notifications/status checks

#### Scenario: Non-admin cannot read or write the webhook URL
- **WHEN** a Clipador or Uploader attempts to view or change the N8N webhook URL, whether through the UI or by calling the API directly
- **THEN** the system denies the request

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

### Requirement: Admin sees everything
An Admin SHALL have the combined view and actions of Clipador and Uploader — the full video library (every user's clips) and the full submission history (every user's submissions) — without needing a separate account per role.

#### Scenario: Admin acts as Clipador
- **WHEN** an Admin opens the video library
- **THEN** the system lets them rename, delete, and download any clip, exactly as a Clipador can for their own view

#### Scenario: Admin acts as Uploader
- **WHEN** an Admin opens the YouTube submission screen
- **THEN** the system lets them submit a link exactly as an Uploader can, in addition to seeing the N8N configuration Uploaders cannot see
