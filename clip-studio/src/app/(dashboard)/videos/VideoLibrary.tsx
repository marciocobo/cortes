"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipSummary } from "@/lib/n8n-client";

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

function clipStatus(clip: ClipSummary): { label: string; className: string } {
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cuttingClip, setCuttingClip] = useState<ClipSummary | null>(null);

  async function load() {
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

  useEffect(() => {
    // load() sets state from the fetch response (an external system), not
    // synchronously in the effect body itself - the async gap is the
    // legitimate case react-hooks/set-state-in-effect's own docs call out.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
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
      setRenamingId(null);
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
      setConfirmDeleteId(null);
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

  return (
    <div>
      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="video-grid">
        {clips.map((clip) => (
          <div key={clip.itemId} className="card video-card">
            <div className="thumb-wrap">
              {clip.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clip.thumbnailUrl} alt="" className="thumb" />
              ) : (
                <div className="thumb" />
              )}
              <svg className="play-icon" viewBox="0 0 24 24" fill="white">
                <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.5)" />
                <path d="M10 8l6 4-6 4V8z" />
              </svg>
              <span className="duration-badge">{formatDuration(clip.durationSeconds)}</span>
            </div>
            <div className="body">
              {renamingId === clip.itemId ? (
                <RenameInline
                  initialValue={clip.name}
                  busy={busyId === clip.itemId}
                  onCancel={() => setRenamingId(null)}
                  onSave={(name) => handleRename(clip.itemId, name)}
                />
              ) : (
                <p className="name">{clip.hook || clip.name}</p>
              )}
              <p className="meta">
                {[formatSize(clip.sizeBytes), formatDate(clip.modifiedAt)].filter(Boolean).join(" · ")}
              </p>
              {(() => {
                const status = clipStatus(clip);
                return (
                  <span className={`clip-status-pill ${status.className}`}>{status.label}</span>
                );
              })()}
              <div className="actions">
                {clip.downloadUrl && (
                  <a
                    className="btn-secondary"
                    href={`/api/clips/download?itemId=${encodeURIComponent(clip.itemId)}`}
                  >
                    Baixar
                  </a>
                )}
                <button
                  className="btn-secondary"
                  onClick={() => setCuttingClip(clip)}
                  disabled={busyId === clip.itemId || clip.durationSeconds == null}
                  title={clip.durationSeconds == null ? "Duração do clipe desconhecida" : undefined}
                >
                  Cortar
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setRenamingId(clip.itemId)}
                  disabled={busyId === clip.itemId}
                >
                  Renomear
                </button>
                {confirmDeleteId === clip.itemId ? (
                  <>
                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(clip.itemId)}
                      disabled={busyId === clip.itemId}
                    >
                      Confirmar exclusão
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={busyId === clip.itemId}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button className="btn-danger" onClick={() => setConfirmDeleteId(clip.itemId)}>
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {cuttingClip && (
        <CutModal
          clip={cuttingClip}
          onClose={() => setCuttingClip(null)}
          onSaved={async () => {
            setCuttingClip(null);
            await load();
          }}
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
  onSaved,
}: {
  clip: ClipSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const duration = clip.durationSeconds ?? 0;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(duration);
  const [currentTime, setCurrentTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTrimStartChange(value: number) {
    setTrimStart(Math.min(value, trimEnd - 1 < 0 ? 0 : trimEnd - 1));
    saveDraft(clip.itemId);
  }

  function handleTrimEndChange(value: number) {
    setTrimEnd(Math.max(value, trimStart + 1 > duration ? duration : trimStart + 1));
    saveDraft(clip.itemId);
  }

  function handleCancel() {
    clearDraft(clip.itemId);
    onClose();
  }

  function handlePreview() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = trimStart;
    video.play().catch(() => {});
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (video.currentTime >= trimEnd) video.pause();
  }

  async function handleSave() {
    setError(null);
    if (trimEnd <= trimStart) {
      setError("O fim deve ser maior que o início");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/clips/trim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: clip.itemId,
          newStartSec: trimStart,
          newEndSec: trimEnd,
          currentClipDurationSec: duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao cortar o vídeo");
      clearDraft(clip.itemId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cortar o vídeo");
    } finally {
      setBusy(false);
    }
  }

  const fillStart = duration > 0 ? (trimStart / duration) * 100 : 0;
  const fillWidth = duration > 0 ? ((trimEnd - trimStart) / duration) * 100 : 0;
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
            style={{
              width: "100%",
              maxHeight: "38vh",
              borderRadius: 8,
              background: "#000",
              marginBottom: 16,
              display: "block",
              objectFit: "contain",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              background: "#000",
              borderRadius: 8,
              marginBottom: 16,
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
          <span>Selecionado: {formatTime(trimEnd - trimStart)}</span>
        </div>
        <div
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
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Início — {formatTime(trimStart)}
          </label>
          <input
            type="range"
            min={0}
            max={duration}
            step={1}
            value={trimStart}
            onChange={(e) => handleTrimStartChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Fim — {formatTime(trimEnd)}
          </label>
          <input
            type="range"
            min={0}
            max={duration}
            step={1}
            value={trimEnd}
            onChange={(e) => handleTrimEndChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
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
            justifyContent: "flex-end",
            flexWrap: "wrap",
            position: "sticky",
            bottom: 0,
            background: "var(--bg)",
            paddingTop: 8,
          }}
        >
          <button
            onClick={handlePreview}
            disabled={busy || !clip.downloadUrl}
            style={{
              background: "transparent",
              border: "1px solid #fcfcfc",
              color: "#fcfcfc",
              borderRadius: 100,
              padding: "10px 20px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Pré-visualizar
          </button>
          <button
            onClick={handleCancel}
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
            onClick={handleSave}
            disabled={busy}
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
            Salvar corte
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameInline({
  initialValue,
  busy,
  onCancel,
  onSave,
}: {
  initialValue: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          flex: 1,
          background: "#0f0f12",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text)",
          padding: "4px 6px",
          fontSize: "0.85rem",
        }}
      />
      <button className="btn-secondary" disabled={busy} onClick={() => onSave(value)}>
        OK
      </button>
      <button className="btn-secondary" disabled={busy} onClick={onCancel}>
        X
      </button>
    </div>
  );
}
