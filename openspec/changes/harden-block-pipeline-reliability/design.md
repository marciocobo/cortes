## Context

The workflow (`ID4wisnN4Tqpt2zh` / `workflow-blocos.json` / `n8n-video-silence-cutter.html`
→ `buildBlockWorkflow()`) processes clips one at a time inside `Loop Over Items`
(`splitInBatches`, batch size 1). Today, `Montar Clipes` precomputes `prevClipEnd`/
`nextClipStart` for every clip **before the loop starts**, using each neighbor's
*raw* AI-selected `clipStart`/`clipEnd` — never the neighbor's silence-adjusted
`real_start`/`real_end`, because those don't exist yet at that point (they're only
computed later, per-item, inside `FFmpeg Cortar 9:16`'s bash command). This is the
root cause of the residual clamp gap documented in CLAUDE.md ("Bug crítico
corrigido — snap de silêncio..." / 17/08/2026 audit addendum): each clip's clamp
checks against a neighbor's *raw* position, so both sides of a gap can erode
toward each other independently and still pass their individual clamp checks.
See proposal.md - Why for the concrete 4.74s production case.

## Goals / Non-Goals

**Goals:**
- Make the collision clamp compare against the neighbor's real (adjusted)
  boundary whenever that value is knowable at clamp time.
- Do this without changing the AI selection logic, prompts, or the existing
  35–180s duration / 15s-raw-gap rules.
- Keep the fix inside the existing per-item Execute Command / Code node
  architecture (no new node types, no new external services), consistent with
  the project's established pattern (Execute Command for ffmpeg/whisper, Code
  nodes for JS logic).

**Non-Goals:**
- Reworking `Loop Over Items` into a different iteration primitive.
- Making the clamp itself react to AI content (it stays purely arithmetic).
- Solving the previously-documented, unrelated limitation where a clip has no
  detectable silence on either side at all (that requires AI-side changes, not
  a clamp fix — out of scope here, unchanged by this design).

## Decisions

### 1. Retry configuration values
Use the same pattern already applied 08/07/2026 to `Baixar Vídeo`/upload nodes:
`retryOnFail: true`, `maxTries: 5`, `waitBetweenTries: 5000` (ms) for the two AI
HTTP nodes and the Graph API calls. `Baixar Vídeo` already uses `maxTries: 3`;
reuse `5`/`5000` for AI and Graph calls since those are lighter/cheaper requests
than a multi-GB video download, so a slightly more persistent retry has low cost.
Alternative considered: exponential backoff — rejected as unnecessary complexity;
n8n's built-in linear retry has been sufficient for every prior transient-failure
incident in this project's history (OneDrive 504s, etc.).

### 2. `onError: continueRegularOutput` scope
Apply only to the per-clip nodes that run **inside** `Loop Over Items` (ffmpeg
cut, uploads for that clip) — not to nodes before the loop (download, whisper.cpp,
both AI calls). A failure before the loop means there's no usable transcription/
selection to work from at all, so aborting the whole execution remains correct
there; a failure processing one clip out of 5–8 should not cost the others.
Alternative considered: blanket `continueRegularOutput` on every node — rejected
because it would mask real upstream failures (e.g. a whisper.cpp crash) as
"success with partial output," making diagnosis harder for exactly the kind of
incident this project's CLAUDE.md history shows are already hard to track down.

### 3. Credential migration mechanism (revised after checking `get_node_types`)
**Originally decided `HTTP Header Auth` (generic credential), reasoning that the
native OpenAI credential type was incompatible with this workflow's
`specifyBody: "keypair"` body-construction pattern.** That reasoning conflated
two independent concerns: the credential type only controls how the
`Authorization` header is injected; it has no bearing on how the request body is
built. Checked directly against the HTTP Request node's real type definition
(`get_node_types`, v4.4) before implementing: its `authentication` builder hint
explicitly says to *prefer* `predefinedCredentialType` "whenever n8n already
ships a credential for the target service... look it up by the request URL
rather than guessing" — and n8n ships a native `openAiApi` credential type. This
is exactly the same pattern already used elsewhere in this same workflow for
the Microsoft Graph calls (`authentication:"predefinedCredentialType",
nodeCredentialType:"microsoftOneDriveOAuth2Api"`), so it is also the more
consistent choice, not just the more idiomatic one.

Both HTTP Request nodes now use `authentication: "predefinedCredentialType",
nodeCredentialType: "openAiApi"`, with `sendHeaders` dropping to `false` for the
OpenAI engine (no manual `Authorization` header at all — n8n injects it from the
credential). `specifyBody`/`bodyParameters` are untouched, confirming the two
concerns were indeed independent. This also means the user does not need to
create a new generic credential at all: n8n's native "OpenAI" credential (a
single API-key field, created once in the n8n UI — Credentials → Add Credential
→ OpenAI) is sufficient and was, in practice, already created by the user
mid-implementation (`OpenAI account`, type `openAiApi`, id `Nbuq36KrXwL1exNW`)
before this correction was made — confirming the simpler path is also the one
that matches what a user reaches for first.

Per the MCP lesson already recorded in CLAUDE.md ("Pegadinha de credenciais do
MCP do n8n"), applying this via MCP requires an explicit `setNodeCredential`
operation after the node's `parameters` are updated — an inline `credentials`
block during `updateNodeParameters` is not sufficient.

### 4. Collision clamp: pass the neighbor's *actual* adjusted boundary forward
Because clips are processed one at a time via `Loop Over Items` (batch size 1,
sequential), each iteration completes and persists its own `real_start`/
`real_end` to `_meta.json` (already done since 31/07/2026) before the next
iteration's `FFmpeg Cortar 9:16` command runs. The fix threads the *previous*
iteration's actual `AEND` (its computed `real_end`, not its raw `clipEnd`)
forward into the *next* iteration's clamp input, replacing today's
`prevClipEnd` (precomputed raw value from `Montar Clipes`).

Concretely: `FFmpeg Cortar 9:16`'s bash command, after computing `AEND` for the
current clip, writes it to a small state file (e.g.
`/home/node/.n8n-files/.prev_clip_real_end`) in addition to patching
`real_end` into `_meta.json` as it already does. The **next** iteration's clamp
reads `PREVEND` from that state file when present, falling back to the
precomputed raw `prevClipEnd` only for the very first clip (no predecessor) or
if the state file is unexpectedly missing (defensive fallback — never worse than
today's behavior). `nextClipStart` (looking forward) cannot be resolved this way
without breaking sequential/one-item-at-a-time processing — the *next* clip's
adjustment hasn't happened yet when the current clip runs — so the forward-looking
comparison keeps using the neighbor's raw `clipStart` value, same as today. This
means the fix eliminates erosion from the *processed-so-far* (backward) direction
completely, and narrows — without eliminating — the forward-direction race,
which is consistent with the audit's observed direction of the 4.74s case
(sequential accumulation from earlier clips).

Alternative considered: compute all clips' `real_start`/`real_end` in a first
pass (loop once collecting silencedetect results, without cutting), then clamp
and cut in a second pass with full neighbor knowledge on both sides. Rejected for
this change: doubles the number of `ffmpeg -af silencedetect` calls (once per
clip per pass) and requires restructuring `Loop Over Items` into two connected
loops — a materially larger change than the audit's finding warrants, given the
finding was "3 of 20 pairs below intended gap, 1 below the safety floor, zero
overlaps" (not a correctness-breaking bug). This can be revisited later if the
one-directional fix here proves insufficient in a future clipador audit.

## Risks / Trade-offs

- [Forward-direction (next-neighbor) erosion is not fully closed by Decision 4] →
  Documented above as accepted scope; monitor with the `clipador` agent on the
  next real execution after this change ships, same validation pattern already
  used for every prior timing fix in this project.
- [State file (`.prev_clip_real_end`) could go stale across separate workflow
  executions if not cleaned up] → Reuse the existing cleanup convention: `Limpar
  Vídeo Original` (already responsible for removing the `.processing.lock` file
  at the end of a successful run) also removes `.prev_clip_real_end`. Additionally,
  the *first* clip of every execution unconditionally treats the file as absent
  (ignores any stale content) since `prevClipEnd` for clip 1 is always `null` in
  `Montar Clipes`'s output — a stale file can only affect a wrong PREVEND
  positively (i.e. never applies to clip 1), so no cross-execution leakage into
  first-clip logic even if cleanup is skipped once.
- [`retryOnFail` on AI calls could retry a request that already partially
  succeeded server-side but timed out on the response] → Same trade-off already
  accepted for the existing retry-enabled nodes (uploads); OpenAI chat completions
  are not billed/side-effecting in a way where a duplicate call causes data
  corruption downstream (the response is just re-parsed JSON), unlike e.g. a
  non-idempotent write.
- [Credential must exist in the target n8n instance before import] → Called out
  as a **BREAKING** (operational) item in proposal.md; tasks.md must include an
  explicit manual pre-step for the user to create the credential before this
  change is applied to production via MCP.

## Migration Plan

1. Apply the HTML/JSON changes locally first (retry flags, `onError`, clamp
   state-file logic) and validate with the project's existing harness pattern
   (Node `vm.createContext` running `buildBlockWorkflow()`, `sh -n` on the bash
   command, `new Function()` on Code node bodies) — same validation approach used
   for every prior change in this project (see CLAUDE.md, e.g. 31/07/2026 entry).
2. User creates the native `OpenAI` credential (`openAiApi` type) in the n8n
   instance (manual, outside this repo — Credentials → Add Credential →
   OpenAI) with their API key.
3. Apply to production via MCP: `update_workflow` (`updateNodeParameters` for
   retry/onError/clamp changes, `setNodeCredential` for the two AI nodes) +
   `publish_workflow`, then `get_workflow_details` to diff-confirm production
   matches `workflow-blocos.json` byte-for-byte on every touched node — the
   established verification step for every prior MCP-applied fix in this project.
4. Rollback: since every prior change is retained in n8n's version history
   (`get_workflow_history` / `restore_workflow_version`), rollback is restoring
   the pre-change published version — no separate rollback script needed.

## Open Questions

None — the one deferred concern (forward-direction clamp erosion) is scoped
explicitly as accepted risk in this design, not left undecided.
