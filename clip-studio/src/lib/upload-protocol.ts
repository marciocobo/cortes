import { tmpdir } from "node:os";
import { join } from "node:path";

// resumable-upload: a direct file upload is split into fixed-size chunks,
// each sent as its own PUT request, instead of one long-lived request for
// the whole file. Motivation: a single multi-GB fetch has no way to
// recover from a mid-transfer network drop except restarting from byte 0 -
// observed in production on a real ~7GB upload that "aborted" 4 times in a
// row, each time at a different multi-GB point, never completing.
// Splitting into chunks bounds how much work one dropped connection costs
// (one chunk, auto-retried by the client) instead of the entire transfer,
// and lets an exhausted-retries pause be resumed later (same page, a
// reload, or a different day) instead of starting over - see
// SubmitForm.tsx and the four routes under api/submissions/upload/.
export const UPLOAD_CHUNK_SIZE = 64 * 1024 * 1024; // 64MB

// Deterministic path from submissionId (no mkdtemp/random suffix needed) -
// every route handler that touches a given upload's bytes (chunk, complete)
// can independently recompute the same path without sharing in-memory
// state or a DB column for it.
export function uploadTmpDir(submissionId: string): string {
  return join(tmpdir(), `clip-studio-upload-${submissionId}`);
}

export function uploadTmpPath(submissionId: string): string {
  return join(uploadTmpDir(submissionId), "upload");
}
