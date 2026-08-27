## Purpose

Provides real user accounts, credentials-based login, and a 3-role permission model (Clipador, Uploader, Admin) that every other Clip Studio capability relies on to gate its screens and API routes.

## ADDED Requirements

### Requirement: Credentials login
The system SHALL allow a user to authenticate with an email and password and SHALL reject invalid credentials without revealing whether the email or the password was wrong.

#### Scenario: Successful login
- **WHEN** a user submits a registered email and the correct password
- **THEN** the system creates a session and redirects the user to their default view (Vídeos for Clipador/Admin, Enviar Vídeo for Uploader)

#### Scenario: Invalid credentials
- **WHEN** a user submits an unregistered email, or a registered email with the wrong password
- **THEN** the system rejects the login with a generic "email ou senha inválidos" error and does not create a session

#### Scenario: Deactivated account
- **WHEN** a user with a deactivated account submits correct credentials
- **THEN** the system rejects the login and does not create a session

### Requirement: Role-gated access
Every account SHALL have exactly one role — Clipador, Uploader, or Admin — and the system SHALL enforce role permissions on both the UI (which tabs/actions render) and the API (server-side check on every request), never relying on the UI alone.

#### Scenario: Clipador permissions
- **WHEN** a user with role Clipador is authenticated
- **THEN** the system grants access to the video library (`clip-studio/video-library`) and the YouTube submission flow (`clip-studio/youtube-ingestion`), and denies access to the admin console (`clip-studio/admin-console`)

#### Scenario: Uploader permissions
- **WHEN** a user with role Uploader is authenticated
- **THEN** the system grants access only to the YouTube submission flow (`clip-studio/youtube-ingestion`) and denies access to the video library and the admin console

#### Scenario: Admin permissions
- **WHEN** a user with role Admin is authenticated
- **THEN** the system grants access to the video library, the YouTube submission flow, and the admin console, and the video library and submission history show every user's videos/submissions, not just the Admin's own

#### Scenario: API rejects unauthorized role
- **WHEN** a request to an API route reserved for a role the authenticated user does not have (e.g. an Uploader calling a video-delete endpoint) arrives
- **THEN** the system rejects the request with an authorization error and performs no side effect, regardless of what the client-side UI would have allowed

### Requirement: Session persistence and logout
The system SHALL persist an authenticated session across page reloads until the user logs out or the session expires, and SHALL provide an explicit logout action.

#### Scenario: Session survives reload
- **WHEN** an authenticated user reloads the page or opens a new tab to the app
- **THEN** the system keeps them logged in without prompting for credentials again

#### Scenario: Logout
- **WHEN** an authenticated user clicks "Sair"
- **THEN** the system ends the session and returns the user to the login screen; subsequent requests to protected routes are rejected until they log in again
