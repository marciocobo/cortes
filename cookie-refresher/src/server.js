const express = require('express');
const cron = require('node-cron');
const { refreshCookies, bootstrapProfile } = require('./refresh');

const PORT = process.env.PORT || 4600;
const app = express();
app.use(express.text({ type: '*/*', limit: '256kb' }));

let refreshing = false;
let lastResult = null;

async function runRefresh(trigger, fn) {
  if (refreshing) {
    return { ok: false, reason: 'refresh_ja_em_andamento' };
  }
  refreshing = true;
  try {
    const result = await fn();
    lastResult = { ...result, trigger, at: new Date().toISOString() };
    return result;
  } catch (err) {
    lastResult = {
      ok: false,
      reason: 'erro_inesperado',
      message: String(err && err.message ? err.message : err),
      trigger,
      at: new Date().toISOString(),
    };
    return lastResult;
  } finally {
    refreshing = false;
  }
}

// Called by the "Baixar Video YouTube" n8n node, both preventively (daily
// cron below) and reactively (on the exact bot-check failure signature).
app.post('/refresh', async (_req, res) => {
  const result = await runRefresh('webhook', refreshCookies);
  res.status(result.ok ? 200 : 502).json(result);
});

// One-time (or rare re-login) manual setup step — see deploy/README.md.
// Body: raw Netscape-format cookies.txt content.
app.post('/bootstrap', async (req, res) => {
  const cookiesTxt = typeof req.body === 'string' ? req.body : '';
  const result = await runRefresh('bootstrap', () => bootstrapProfile(cookiesTxt));
  res.status(result.ok ? 200 : 502).json(result);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, refreshing, lastResult });
});

// Preventive daily refresh — 04:00 UTC, a low-traffic window for this
// pipeline (see design.md — Open Questions; adjustable without spec impact).
cron.schedule('0 4 * * *', () => {
  runRefresh('cron', refreshCookies).catch(() => {});
});

app.listen(PORT, () => {
  console.log(`cookie-refresher ouvindo na porta ${PORT}`);
});
