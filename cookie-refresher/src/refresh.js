const fs = require('fs');
const { chromium } = require('playwright');
const { toNetscapeFormat, parseNetscapeCookies } = require('./netscape');

const PROFILE_DIR = process.env.PROFILE_DIR || '/profile';
const COOKIE_MASTER_PATH = process.env.COOKIE_MASTER_PATH || '/data/youtube-cookies.master.txt';
const COOKIE_UID = Number(process.env.COOKIE_UID || 1000);
const COOKIE_GID = Number(process.env.COOKIE_GID || 1000);

// DOM-based detection (looking for a "Sign in" button/absence of one) was
// tried first and produced a false positive in practice: an unauthenticated
// profile's first visit can render a consent screen or a page state that
// matches neither selector, silently reporting "logged in" for a page that
// never actually was. Fixed by checking for the actual Google auth cookie
// (SAPISID/SID) instead of DOM state — these are only ever set by a real
// login, are exactly what yt-dlp itself relies on to be authenticated (so
// this check tests the thing that actually matters), and are immune to
// YouTube's frequent frontend markup changes.
async function isLoggedIn(context) {
  const cookies = await context.cookies(['https://www.youtube.com', 'https://www.google.com']);
  return cookies.some(
    (c) => (c.name === 'SAPISID' || c.name === 'SID') && c.value && c.value.length > 0
  );
}

function writeMasterCookieFile(netscapeText) {
  const tmpPath = `${COOKIE_MASTER_PATH}.tmp`;
  fs.writeFileSync(tmpPath, netscapeText, { mode: 0o600 });
  fs.chownSync(tmpPath, COOKIE_UID, COOKIE_GID);
  fs.chmodSync(tmpPath, 0o400);
  fs.renameSync(tmpPath, COOKIE_MASTER_PATH); // atomic on the same filesystem
}

// Re-visits youtube.com with the existing persistent profile and
// re-exports its current session cookies. NEVER submits credentials —
// per design.md, only a real one-time (or, rarely, re-run) bootstrap
// (see bootstrapProfile below) establishes the logged-in session.
async function refreshCookies() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await context.newPage();
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle', timeout: 30000 });

    if (!(await isLoggedIn(context))) {
      return { ok: false, reason: 'sessao_expirada_precisa_login_manual' };
    }

    const cookies = await context.cookies();
    writeMasterCookieFile(toNetscapeFormat(cookies));

    return { ok: true, cookieCount: cookies.length };
  } finally {
    await context.close();
  }
}

// One-time (or rare re-login) setup: seeds the persistent profile from a
// Netscape-format cookies.txt the user exports by hand from their own
// logged-in browser — the exact same manual step already documented in
// clip-studio/deploy/README.md §4, just performed once here instead of
// every time the session rotates. Immediately re-validates via the normal
// refresh flow so the caller gets the same ok/reason contract either way.
async function bootstrapProfile(cookiesTxt) {
  const parsed = parseNetscapeCookies(cookiesTxt);
  if (parsed.length === 0) {
    return { ok: false, reason: 'cookies_txt_vazio_ou_formato_invalido' };
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    await context.addCookies(parsed);
  } finally {
    await context.close();
  }

  // Re-open freshly so the added cookies are the ones actually exercised,
  // then run the normal export path to validate login and write the file.
  return refreshCookies();
}

module.exports = { refreshCookies, bootstrapProfile, isLoggedIn };
