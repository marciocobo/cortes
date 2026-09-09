// Custom server (see node_modules/next/dist/docs/01-app/02-guides/custom-server.md)
// - `next start` runs on Node's default http.Server, which times out any
// request that isn't fully received within 5 minutes (server.requestTimeout,
// Node's own default since v18 - Next.js never overrides it). A multi-GB
// video upload over a normal home connection routinely takes longer than
// that, so the connection got killed (HTTP 408) mid-upload before our own
// code ever saw the full body - confirmed with a throttled upload test that
// failed at exactly ~300s. next.config.ts has no setting for this; a custom
// server is the only way to change it.
const { createServer } = require("http");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  // 0 disables the timeout entirely - matches the already-generous
  // UPLOAD_WEBHOOK_TIMEOUT_MS (3h) used for the outbound proxy call to n8n
  // in n8n-client.ts, so neither leg of the upload path cuts a large file
  // off early.
  server.requestTimeout = 0;

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
