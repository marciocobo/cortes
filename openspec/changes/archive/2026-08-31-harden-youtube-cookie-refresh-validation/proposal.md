## Why

The reactive refresh-and-retry flow in `youtube-cookie-auth` treats a `/refresh` or `/bootstrap` call as successful whenever the persistent browser profile shows a `SAPISID`/`SID` cookie after visiting `youtube.com` — but that check only proves the cookie *looks* logged-in to a Playwright browser, not that it will actually authenticate a real `yt-dlp` download. Observed in production on 2026-08-31: a manual `/bootstrap` returned `{"ok":true,"cookieCount":22}` with all the expected cookie names present (`SID`, `SAPISID`, `__Secure-3PSID`, `LOGIN_INFO`, the `SIDCC` family, etc.), yet the very next `yt-dlp` download against the same video still failed with YouTube's bot-check, this time with yt-dlp's own warning that the cookies "have likely been rotated ... as a security measure." A second bootstrap, done immediately after a fresh export with no intervening browsing, did work. The existing spec's "Transient stale cookie recovers automatically" scenario implicitly assumes refresh-success implies download-success; this incident shows that assumption can be false, and today nothing in the system would have caught it short of a human noticing the ingestion still failing.

## What Changes

- Document the gap between "refresh reports ok" and "the next real download will succeed" as a known reliability risk in `youtube-cookie-auth`.
- No implementation decided yet — the exact fix (e.g. an end-to-end `yt-dlp --simulate` probe as part of what counts as a successful refresh/bootstrap, a different validity check, or something else) is still to be evaluated in a follow-up design pass.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `clip-studio/youtube-cookie-auth`: the refresh/bootstrap success criteria needs to reflect real `yt-dlp` download validity, not just presence of `SAPISID`/`SID` cookies in a Playwright profile — current requirements ("Reactive refresh on bot-check failure", "No automated login") are silent on this gap and need a scenario covering it once a solution is chosen.

## Impact

- `cookie-refresher/src/refresh.js` (`isLoggedIn`, `refreshCookies`, `bootstrapProfile`) — the functions whose success signal is too weak.
- `cookie-refresher/deploy/baixar-video-youtube.sh` — the retry caller that trusts `/refresh`'s `ok:true` at face value.
- No code changes in this change; captured for a future design/implementation pass.
