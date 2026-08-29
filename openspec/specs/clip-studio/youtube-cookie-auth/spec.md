## Purpose

Keeps the YouTube session credential that the ingestion pipeline's `yt-dlp` download step depends on valid without a human manually re-exporting and re-copying a cookie file every time YouTube rotates the session.

## Requirements

### Requirement: Preventive daily cookie refresh
The system SHALL refresh the exported YouTube session cookie file at least once per day using the persistent, already-authenticated browser profile, without re-entering any credentials.

#### Scenario: Scheduled refresh succeeds
- **WHEN** the daily scheduled refresh runs and the persistent browser profile's session is still valid
- **THEN** the system overwrites the shared cookie file with the freshly exported cookies and the ingestion pipeline's next download uses the new file automatically (no restart required)

### Requirement: Reactive refresh on bot-check failure
When a YouTube download fails specifically because YouTube demanded sign-in confirmation (the "Sign in to confirm you're not a bot" failure signature), the system SHALL attempt exactly one automatic cookie refresh followed by exactly one retry of the same download before surfacing the failure.

#### Scenario: Transient stale cookie recovers automatically
- **WHEN** a download attempt fails with the bot-check signature and the persistent browser profile's session is still valid
- **THEN** the system refreshes the cookie file, retries the download once, and the download succeeds without any human intervention or visible error to the Uploader

#### Scenario: Retry also fails, error surfaces normally
- **WHEN** the refresh-and-retry attempt also fails
- **THEN** the system surfaces the failure through the existing ingestion error-callback path exactly as it does for any other unrecoverable download failure, with no more than one retry attempt made

### Requirement: No automated login
The system SHALL NOT attempt to authenticate with a username, password, or any other credential during a refresh. A refresh SHALL only reuse the existing persistent browser session.

#### Scenario: Persistent session has actually expired
- **WHEN** a refresh is attempted and the persistent browser profile is no longer logged in
- **THEN** the system returns an explicit failure result indicating manual re-login is required, and does not attempt to submit any credentials

### Requirement: Internal-only exposure
The refresh capability SHALL only be reachable from within the internal deployment network (the ingestion workflow and its own scheduler). It SHALL NOT be exposed through any public DNS route.

#### Scenario: No external route exists
- **WHEN** the deployment is inspected for public ingress routes
- **THEN** no route to the cookie-refresh capability is found outside the internal Docker network
