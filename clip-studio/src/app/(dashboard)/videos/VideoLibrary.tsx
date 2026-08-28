"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ClipSummary } from "@/lib/n8n-client";

// video-library spec: video-card action icons - the prototype replaced the
// old text buttons (Cortar/Renomear/Excluir) with plain circular icon
// buttons (scissors/pencil/trash, all neutral - "Excluir" has no
// destructive red in the mockup, only the DeleteConfirmModal's real
// confirmation does). Hand-rolled inline SVGs matching that icon set
// instead of adding an icon library dependency for 4 icons - the project
// already hand-rolls the play-icon SVG the same way.
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function DownloadIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ScissorsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="6" cy="6" r="3" />
      <path d="M8.12 8.12 12 12" />
      <path d="M20 4 8.12 15.88" />
      <circle cx="6" cy="18" r="3" />
      <path d="M14.8 14.8 20 20" />
    </svg>
  );
}

// Unused while the Renomear icon-button is hidden (see its former call
// site further down) - kept for when it's re-enabled.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RenameIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

// CutModal footer icons - prototype replaced "Pré-visualizar"/"Cancelar"/
// "Salvar corte" with icon-only buttons: play (ghost, isolated on the
// left), X (ghost) and a filled-white save/disk icon grouped on the right
// - see their usage in CutModal for the layout/style split.
function PlayFilledIcon() {
  return (
    <svg {...ICON_PROPS} fill="currentColor">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

// Shown in place of PlayFilledIcon while the CutModal preview is playing -
// a true pause (resuming continues from the same position), not a reset.
function PauseFilledIcon() {
  return (
    <svg {...ICON_PROPS} fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

// The separate "Parar" button - resets the preview to effectiveStart
// without playing, unlike pause (which keeps the current position).
function StopFilledIcon() {
  return (
    <svg {...ICON_PROPS} fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg {...ICON_PROPS} width={16} height={16}>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V3.4" />
    </svg>
  );
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number | null) {
  if (bytes == null) return null;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR");
}

// video-library spec: "Clip status indicator" - "Rascunho" has no backend
// concept of an in-progress edit, so it's tracked client-side only
// (per browser/device) via localStorage, cleared on Cancelar or a
// successful Salvar corte.
function draftKey(itemId: string) {
  return `clipstudio:trim-draft:${itemId}`;
}

function hasDraft(itemId: string): boolean {
  try {
    return localStorage.getItem(draftKey(itemId)) != null;
  } catch {
    return false;
  }
}

function saveDraft(itemId: string) {
  try {
    localStorage.setItem(draftKey(itemId), "1");
  } catch {
    // Private browsing / storage disabled - draft indicator just won't show.
  }
}

function clearDraft(itemId: string) {
  try {
    localStorage.removeItem(draftKey(itemId));
  } catch {
    // no-op
  }
}

function clipStatus(
  clip: ClipSummary,
  isProcessing: boolean
): { label: string; className: string } {
  if (isProcessing) return { label: "Processando", className: "clip-status-processando" };
  if (clip.edited) return { label: "Cortado", className: "clip-status-cortado" };
  if (hasDraft(clip.itemId)) return { label: "Rascunho", className: "clip-status-rascunho" };
  return { label: "Original", className: "clip-status-original" };
}

// Matches .video-card's real layout (thumb-wrap + name/meta/pill lines) so
// the grid doesn't visibly reflow once real clips replace the placeholders.
function VideoGridSkeleton() {
  return (
    <div className="video-grid">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card video-card">
          <div className="thumb-wrap skeleton-block" />
          <div className="body">
            <div className="skeleton-block" style={{ height: 14, width: "80%", marginBottom: 8, borderRadius: 3 }} />
            <div className="skeleton-block" style={{ height: 12, width: "50%", borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VideoLibrary() {
  const [clips, setClips] = useState<ClipSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingClip, setRenamingClip] = useState<ClipSummary | null>(null);
  const [deletingClip, setDeletingClip] = useState<ClipSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cuttingClip, setCuttingClip] = useState<ClipSummary | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "name">("recent");

  async function load() {
    lastLoadRef.current = Date.now();
    setError(null);
    try {
      const res = await fetch("/api/clips");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar vídeos");
      setClips(data.clips);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar vídeos");
      setClips([]);
    }
  }

  // Deliberately NOT refetching /api/clips here to "freshen" the duration
  // before opening: it did the opposite of helping. listClips() lists the
  // whole folder AND fetches every single clip's _meta.json individually
  // (an N+1 Microsoft Graph call pattern over 100+ clips) - refetching it
  // on every "Cortar" click, on top of the focus/visibility refresh below,
  // is exactly what tripped Graph's `activityLimitReached` throttling in
  // production and took the whole library down (every endpoint shares the
  // same OneDrive app registration/quota). The stale-duration problem this
  // was trying to prevent is now handled more cheaply anyway: if the real
  // file turns out shorter than what's shown, n8n's trim webhook rejects
  // it and returns the actual measured duration in the error (see
  // handleSaveCut below), which corrects this clip without a full relist.
  function handleOpenCut(clip: ClipSummary) {
    setCuttingClip(clip);
  }

  // The actual cut (wget the current file + ffprobe + ffmpeg + chunked
  // upload back to OneDrive) takes several seconds on the n8n side - real
  // executions have run 7-9s even on success. Blocking the modal on that
  // network call made every hiccup (including the stale-duration race
  // handleOpenCut can't fully close) surface as a raw, confusing error the
  // user had to sit through. Instead: close the modal immediately, mark
  // the card "Processando", and let this fetch run in the background -
  // `load()` on success naturally flips the card to "Cortado" via the
  // meta.json `edited` flag n8n's own workflow already sets.
  function handleSaveCut(clip: ClipSummary, newStartSec: number, newEndSec: number) {
    clearDraft(clip.itemId);
    setCuttingClip(null);
    setProcessingIds((prev) => new Set(prev).add(clip.itemId));
    fetch("/api/clips/trim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: clip.itemId,
        newStartSec,
        newEndSec,
        currentClipDurationSec: clip.durationSeconds ?? 0,
      }),
    })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok) throw new Error(data.error ?? "Falha ao cortar o vídeo");
        // /api/clips/trim's own response already carries the exact
        // durationSeconds it validated against the real file before
        // cutting - it's authoritative. Graph's `video.duration` facet
        // (the only other duration source, see n8n-client.ts) is
        // populated asynchronously and is often still missing right after
        // a fresh upload, so load()'s refetch alone would show "--:--"
        // immediately after a successful cut. Patch it in as a fallback
        // only where the fresh fetch still came back unknown - if Graph
        // DID catch up by the time load() resolves, that real value wins.
        const knownDuration =
          typeof data.durationSeconds === "number" ? data.durationSeconds : null;
        return load().then(() => {
          if (knownDuration == null) return;
          setClips(
            (prev) =>
              prev?.map((c) =>
                c.itemId === clip.itemId && c.durationSeconds == null
                  ? { ...c, durationSeconds: knownDuration }
                  : c
              ) ?? prev
          );
        });
      })
      .catch((err) => {
        // n8n's "Webhook Cortar Clipe" branch now returns the real node
        // error (see n8n-client.ts's callWebhook) instead of a generic
        // wrapper - the most common one carries the REAL duration ffprobe
        // just measured, e.g. "ERRO: intervalo invalido (start=1 end=78
        // duracao=25.300000)". When present, correct this clip's duration
        // immediately instead of waiting on a full reload, so reopening
        // the cut modal right away already has accurate slider bounds.
        const message = err instanceof Error ? err.message : "Falha ao cortar o vídeo";
        const measuredDuration = message.match(/duracao=([\d.]+)/)?.[1];
        if (measuredDuration != null) {
          const realDuration = Number(measuredDuration);
          setClips(
            (prev) =>
              prev?.map((c) =>
                c.itemId === clip.itemId ? { ...c, durationSeconds: realDuration } : c
              ) ?? prev
          );
          setError(
            `Falha ao cortar "${clip.hook || clip.name}": o vídeo agora tem apenas ` +
              `${formatDuration(realDuration)} - os valores foram corrigidos, abra o corte de novo.`
          );
        } else {
          setError(`Falha ao cortar "${clip.hook || clip.name}": ${message}`);
        }
      })
      .finally(() => {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(clip.itemId);
          return next;
        });
      });
  }

  const lastLoadRef = useRef(0);

  useEffect(() => {
    // load() sets state from the fetch response (an external system), not
    // synchronously in the effect body itself - the async gap is the
    // legitimate case react-hooks/set-state-in-effect's own docs call out.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // Rename/delete/trim already refresh via load() right after they finish
  // in THIS tab - this covers changes made elsewhere (another tab, another
  // session, or a trim that finished after the user tabbed away) so
  // returning to this screen doesn't need a manual reload to catch up.
  // Rate-limited to at most once every 2 minutes: /api/clips lists the
  // whole folder AND fetches every single clip's _meta.json individually
  // (an N+1 Microsoft Graph call pattern over 100+ clips) - refetching it
  // on every tab-focus/visibility flip with no guard is exactly what
  // tripped Graph's `activityLimitReached` throttling in production and
  // took the whole library down for a few minutes (every endpoint shares
  // the same OneDrive app registration/quota).
  useEffect(() => {
    const MIN_INTERVAL_MS = 2 * 60 * 1000;
    function refreshIfDue() {
      if (Date.now() - lastLoadRef.current < MIN_INTERVAL_MS) return;
      lastLoadRef.current = Date.now();
      load();
    }
    function handleVisible() {
      if (document.visibilityState === "visible") refreshIfDue();
    }
    window.addEventListener("focus", refreshIfDue);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("focus", refreshIfDue);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, []);

  async function handleRename(itemId: string, newName: string) {
    if (!newName.trim()) return;
    setBusyId(itemId);
    try {
      const res = await fetch("/api/clips/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRenamingClip(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renomear");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(itemId: string) {
    setBusyId(itemId);
    try {
      const res = await fetch("/api/clips/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDeletingClip(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setBusyId(null);
    }
  }

  if (clips === null) return <VideoGridSkeleton />;

  if (error && clips.length === 0) {
    return <p className="error-text">{error}</p>;
  }

  if (clips.length === 0) {
    return <p className="empty-state">Nenhum clipe gerado ainda.</p>;
  }

  const sortedClips = [...clips].sort((a, b) => {
    if (sortBy === "name") return (a.hook || a.name).localeCompare(b.hook || b.name, "pt-BR");
    const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
    const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
    return sortBy === "oldest" ? aTime - bTime : bTime - aTime;
  });

  return (
    <div>
      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Ordenar vídeos"
          style={{
            background: "#0f0f12",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text)",
            padding: "6px 8px",
          }}
        >
          <option value="recent">Data: mais recente</option>
          <option value="oldest">Data: mais antiga</option>
          <option value="name">Nome: A-Z</option>
        </select>
      </div>
      <div className="video-grid">
        {sortedClips.map((clip) => {
          const isProcessing = processingIds.has(clip.itemId);
          const status = clipStatus(clip, isProcessing);
          return (
            <div key={clip.itemId} className="card video-card">
              <div className="thumb-wrap">
                {clip.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clip.thumbnailUrl} alt="" className="thumb" />
                ) : (
                  <svg className="play-icon" viewBox="0 0 24 24" fill="white">
                    <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.5)" />
                    <path d="M10 8l6 4-6 4V8z" />
                  </svg>
                )}
                <span className="duration-badge">{formatDuration(clip.durationSeconds)}</span>
              </div>
              <div className="body">
                <p className="name">{clip.hook || clip.name}</p>
                <p className="meta">
                  {[formatSize(clip.sizeBytes), formatDate(clip.modifiedAt)].filter(Boolean).join(" · ")}
                  {clip.submittedByName && (
                    <>
                      <br />
                      Por {clip.submittedByName}
                    </>
                  )}
                </p>
                <span className={`clip-status-pill ${status.className}`}>{status.label}</span>
                <div className="actions">
                  {clip.downloadUrl && (
                    <a
                      className="icon-btn"
                      href={`/api/clips/download?itemId=${encodeURIComponent(clip.itemId)}`}
                      title="Baixar"
                      aria-label="Baixar"
                    >
                      <DownloadIcon />
                    </a>
                  )}
                  <button
                    className="icon-btn"
                    onClick={() => handleOpenCut(clip)}
                    disabled={busyId === clip.itemId || isProcessing || clip.durationSeconds == null}
                    title={
                      clip.durationSeconds == null ? "Duração do clipe desconhecida" : "Cortar"
                    }
                    aria-label="Cortar"
                  >
                    <ScissorsIcon />
                  </button>
                  {/* Renomear hidden for now: a Graph rename bumps the file's
                      lastModifiedDateTime exactly like a trim does, and
                      clipStatus()'s "Cortado" detection (see n8n-client.ts's
                      `edited` comment) is entirely based on
                      lastModifiedDateTime != createdDateTime - so renaming a
                      never-cut clip would falsely flip it to "Cortado" with
                      no way to tell the two apart from Graph's metadata
                      alone. Re-enable once edited-detection has a signal
                      that survives a plain rename (e.g. also comparing file
                      size/hash, not just timestamps) - rename itself
                      (handleRename/RenameModal) is untouched below, only
                      the entry point is hidden. */}
                  <button
                    className="icon-btn"
                    onClick={() => setDeletingClip(clip)}
                    disabled={busyId === clip.itemId || isProcessing}
                    title="Excluir"
                    aria-label="Excluir"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {cuttingClip && (
        <CutModal
          clip={cuttingClip}
          onClose={() => setCuttingClip(null)}
          onSave={(newStartSec, newEndSec) => handleSaveCut(cuttingClip, newStartSec, newEndSec)}
        />
      )}
      {renamingClip && (
        <RenameModal
          clip={renamingClip}
          busy={busyId === renamingClip.itemId}
          onClose={() => setRenamingClip(null)}
          onSave={(name) => handleRename(renamingClip.itemId, name)}
        />
      )}
      {deletingClip && (
        <DeleteConfirmModal
          clip={deletingClip}
          busy={busyId === deletingClip.itemId}
          onClose={() => setDeletingClip(null)}
          onConfirm={() => handleDelete(deletingClip.itemId)}
        />
      )}
    </div>
  );
}

// video-library spec: "Trim (re-cut) clip" - matches the prototype's
// "Cortar vídeo" modal. Sliders go from 0 to the clip's OWN current
// duration (this can only shorten an already-produced clip, not pull in
// more of the original source video - see design.md's "Manual clip
// trimming" decision).
function CutModal({
  clip,
  onClose,
  onSave,
}: {
  clip: ClipSummary;
  onClose: () => void;
  onSave: (newStartSec: number, newEndSec: number) => void;
}) {
  const duration = clip.durationSeconds ?? 0;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(duration);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The modal opens instantly with whatever duration is already in memory
  // (see handleOpenCut) and a background refresh may correct `duration`
  // moments later if it was stale. Clamping here (derived at render time)
  // rather than syncing trimStart/trimEnd via an effect keeps the selection
  // from ever pointing past a real duration that just shrank, without the
  // cascading-render setState-in-effect anti-pattern.
  const effectiveStart = Math.min(trimStart, duration);
  const effectiveEnd = Math.min(trimEnd, duration);

  function handleTrimStartChange(value: number) {
    setTrimStart(Math.min(value, effectiveEnd - 1 < 0 ? 0 : effectiveEnd - 1));
    saveDraft(clip.itemId);
  }

  function handleTrimEndChange(value: number) {
    setTrimEnd(Math.max(value, effectiveStart + 1 > duration ? duration : effectiveStart + 1));
    saveDraft(clip.itemId);
  }

  // Both trim handles live on the same track (see its JSX below) instead
  // of two separate <input type="range"> elements. Pointer capture on the
  // handle itself means pointermove/pointerup keep firing on it even once
  // the cursor drags outside the track's bounds, so we don't need
  // window-level listeners.
  function timeFromPointerX(clientX: number): number {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function handleHandlePointerDown(which: "start" | "end", e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = which;
  }

  function handleHandlePointerMove(which: "start" | "end", e: React.PointerEvent<HTMLDivElement>) {
    if (draggingRef.current !== which) return;
    const time = Math.round(timeFromPointerX(e.clientX));
    if (which === "start") handleTrimStartChange(time);
    else handleTrimEndChange(time);
  }

  function handleHandlePointerUp() {
    draggingRef.current = null;
  }

  function handleCancel() {
    clearDraft(clip.itemId);
    onClose();
  }

  // The button doubles as play/stop: clicking while already previewing
  // stops playback instead of restarting it from effectiveStart.
  // A true play/pause toggle - pausing keeps the current position, and
  // playing again resumes from there (does NOT restart from
  // effectiveStart). See handleStop below for the button that resets to
  // the beginning instead.
  function handlePreview() {
    const video = videoRef.current;
    if (!video) return;
    if (isPreviewPlaying) {
      video.pause();
      setIsPreviewPlaying(false);
      return;
    }
    video.play().catch(() => {});
    setIsPreviewPlaying(true);
  }

  // Resets the preview to effectiveStart without playing - distinct from
  // pause, which preserves the current position for resuming.
  function handleStop() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = effectiveStart;
    setCurrentTime(effectiveStart);
    setIsPreviewPlaying(false);
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (video.currentTime >= effectiveEnd) {
      video.pause();
      setIsPreviewPlaying(false);
    }
  }

  // The actual cut runs in the background after this closes the modal
  // (see handleSaveCut in VideoLibrary) - only the client-side validation
  // (end > start) happens here, synchronously.
  function handleSave() {
    setError(null);
    if (effectiveEnd <= effectiveStart) {
      setError("O fim deve ser maior que o início");
      return;
    }
    onSave(effectiveStart, effectiveEnd);
  }

  const fillStart = duration > 0 ? (effectiveStart / duration) * 100 : 0;
  const fillWidth = duration > 0 ? ((effectiveEnd - effectiveStart) / duration) * 100 : 0;
  const playheadLeft = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid #4f4f80",
          borderRadius: 10,
          padding: 20,
          maxWidth: 520,
          width: "100%",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Cortar vídeo</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
          {clip.name}
        </div>

        {clip.downloadUrl ? (
          <video
            ref={videoRef}
            src={clip.downloadUrl}
            onTimeUpdate={handleTimeUpdate}
            onPause={() => setIsPreviewPlaying(false)}
            style={{
              display: "block",
              margin: "0 auto 16px",
              width: "auto",
              maxWidth: "100%",
              maxHeight: "55vh",
              aspectRatio: "9 / 16",
              borderRadius: 8,
              background: "#000",
              objectFit: "contain",
            }}
          />
        ) : (
          <div
            style={{
              margin: "0 auto 16px",
              width: "auto",
              maxWidth: "100%",
              maxHeight: "55vh",
              aspectRatio: "9 / 16",
              background: "#000",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#757580",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          >
            Pré-visualização não disponível
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--text-dim)",
            marginBottom: 6,
          }}
        >
          <span>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <span>Selecionado: {formatTime(effectiveEnd - effectiveStart)}</span>
        </div>
        <div
          ref={trackRef}
          style={{
            position: "relative",
            height: 8,
            background: "var(--border)",
            borderRadius: 4,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: `${fillStart}%`,
              width: `${fillWidth}%`,
              height: "100%",
              background: "#6199f6",
              borderRadius: 4,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${playheadLeft}%`,
              top: -4,
              width: 2,
              height: 16,
              background: "#fcfcfc",
            }}
          />
          {/* Start/end are dragged directly on this one track instead of
              two separate <input type="range"> sliders - a handle on each
              edge of the selected (blue) region. Pointer capture keeps
              move/up events routed to the handle that started the drag
              even once the cursor leaves the track bounds. */}
          <div
            role="slider"
            aria-label="Início do corte"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={effectiveStart}
            onPointerDown={(e) => handleHandlePointerDown("start", e)}
            onPointerMove={(e) => handleHandlePointerMove("start", e)}
            onPointerUp={handleHandlePointerUp}
            style={{
              position: "absolute",
              left: `${fillStart}%`,
              top: "50%",
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#6199f6",
              border: "2px solid #fcfcfc",
              transform: "translate(-50%, -50%)",
              cursor: "grab",
              touchAction: "none",
            }}
          />
          <div
            role="slider"
            aria-label="Fim do corte"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={effectiveEnd}
            onPointerDown={(e) => handleHandlePointerDown("end", e)}
            onPointerMove={(e) => handleHandlePointerMove("end", e)}
            onPointerUp={handleHandlePointerUp}
            style={{
              position: "absolute",
              left: `${fillStart + fillWidth}%`,
              top: "50%",
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#6199f6",
              border: "2px solid #fcfcfc",
              transform: "translate(-50%, -50%)",
              cursor: "grab",
              touchAction: "none",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--text-dim)",
            marginBottom: 20,
          }}
        >
          <span>Início: {formatTime(effectiveStart)}</span>
          <span>Fim: {formatTime(effectiveEnd)}</span>
        </div>

        {error && (
          <p className="error-text" style={{ marginBottom: 12 }}>
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            flexWrap: "wrap",
            position: "sticky",
            bottom: 0,
            background: "var(--bg)",
            paddingTop: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="icon-btn"
              onClick={handlePreview}
              disabled={!clip.downloadUrl}
              title={isPreviewPlaying ? "Pausar" : "Play"}
              aria-label={isPreviewPlaying ? "Pausar" : "Play"}
            >
              {isPreviewPlaying ? <PauseFilledIcon /> : <PlayFilledIcon />}
            </button>
            <button
              className="icon-btn"
              onClick={handleStop}
              disabled={!clip.downloadUrl}
              title="Parar"
              aria-label="Parar"
            >
              <StopFilledIcon />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="icon-btn"
              onClick={handleCancel}
              title="Cancelar"
              aria-label="Cancelar"
            >
              <CloseIcon />
            </button>
            <button
              onClick={handleSave}
              title="Salvar corte"
              aria-label="Salvar corte"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                flexShrink: 0,
                padding: 0,
                borderRadius: 999,
                border: "none",
                background: "#fcfcfc",
                color: "#0a0a13",
                cursor: "pointer",
              }}
            >
              <SaveIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shared overlay/card chrome matching the prototype's modal style (also
// used by CutModal above): dark overlay, #4f4f80 border, 10px radius.
function ModalOverlay({ children, maxWidth }: { children: ReactNode; maxWidth: number }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid #4f4f80",
          borderRadius: 10,
          padding: 24,
          maxWidth,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// video-library spec: "Rename clip" - matches the prototype's rename modal
// (a centered dialog, not an inline edit in the card).
function RenameModal({
  clip,
  busy,
  onClose,
  onSave,
}: {
  clip: ClipSummary;
  busy: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(clip.name);
  return (
    <ModalOverlay maxWidth={420}>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>Renomear clipe</div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          width: "100%",
          background: "#0f0f12",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text)",
          padding: "10px 12px",
          marginBottom: 20,
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          disabled={busy}
          style={{
            background: "transparent",
            border: "none",
            color: "#a3a3b3",
            borderRadius: 100,
            padding: "10px 20px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(value)}
          disabled={busy || !value.trim()}
          style={{
            background: "#fcfcfc",
            color: "#0a0a13",
            border: "none",
            borderRadius: 100,
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Salvar
        </button>
      </div>
    </ModalOverlay>
  );
}

// video-library spec: "Delete requires confirmation" - matches the
// prototype's confirmation modal (centered dialog with explicit warning
// text), not an inline "Confirmar exclusão" swap in the card.
function DeleteConfirmModal({
  clip,
  busy,
  onClose,
  onConfirm,
}: {
  clip: ClipSummary;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalOverlay maxWidth={440}>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Excluir clipe</div>
      <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 20 }}>
        Tem certeza que deseja excluir &quot;{clip.hook || clip.name}&quot;? Essa ação não pode
        ser desfeita.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          disabled={busy}
          style={{
            background: "transparent",
            border: "none",
            color: "#a3a3b3",
            borderRadius: 100,
            padding: "10px 20px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button className="btn-danger" onClick={onConfirm} disabled={busy}>
          Excluir
        </button>
      </div>
    </ModalOverlay>
  );
}
