export async function register() {
  // Only the real Node.js server process, never the edge/proxy runtime or
  // `next build`'s type-check pass.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { dispatchNextIfIdle } = await import("@/lib/dispatcher");
  const { pollProcessingSubmissions } = await import("@/lib/poller");

  // Recover the queue on boot in case the process restarted mid-download
  // (a submission could be stuck BAIXANDO with nothing actually running).
  dispatchNextIfIdle().catch((err) => console.error("[dispatcher] boot check failed", err));

  const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min - pipeline runs in hours, see design.md Trade-offs.
  setInterval(() => {
    pollProcessingSubmissions().catch((err) => console.error("[poller] tick failed", err));
  }, POLL_INTERVAL_MS);
}
