"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ContentType = "PREGACAO" | "PODCAST";
type SourceType = "link" | "file";
type SubmissionMode = "SHORTS" | "PALAVRA_COMPLETA" | "PODCAST";

function resolveMode(contentType: ContentType, fullWordMode: boolean): SubmissionMode {
  if (contentType === "PODCAST") return "PODCAST";
  return fullWordMode ? "PALAVRA_COMPLETA" : "SHORTS";
}

// resumable-upload spec: remembers an in-progress upload's identity across
// a reload/reopened tab (a File object itself can't survive that - the
// browser doesn't persist it), so re-selecting the SAME file lets the user
// resume from the server's last confirmed chunk instead of restarting a
// multi-GB transfer from byte 0. Matched by name+size+lastModified, which
// is the closest proxy to "same file" available without hashing the whole
// thing client-side.
const RESUME_STORAGE_KEY = "clipStudio.uploadResume";

type ResumeState = {
  submissionId: string;
  fileName: string;
  fileSize: number;
  fileLastModified: number;
};

function loadResumeState(): ResumeState | null {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ResumeState) : null;
  } catch {
    return null;
  }
}

function saveResumeState(state: ResumeState | null) {
  try {
    if (state) localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(RESUME_STORAGE_KEY);
  } catch {
    // localStorage can throw (private browsing, quota) - resume is a nice-
    // to-have, never worth failing the upload itself over.
  }
}

// A definitive server response (submission gone, already past BAIXANDO) -
// retrying the same chunk again would never help, unlike a network drop.
class UploadFatalError extends Error {}

const MAX_CHUNK_RETRIES = 6;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// resumable-upload spec: "Progress advances in bounded steps, network
// drops only cost one chunk". Splits the file into fixed-size chunks (see
// upload/init's response for the size, sourced from lib/upload-protocol.ts
// on the server so the two never drift apart) uploaded one at a time, each
// with its own retry-with-backoff - the fix for a real production failure
// where the same ~7GB single-request upload "aborted" 4 times in a row on
// an unstable home connection, always partway through, never completing.
// If retries are exhausted (sustained outage, not a blip), throws but
// leaves the resume state in localStorage on purpose - the user submitting
// again (this page, or after reopening the browser and re-selecting the
// same file) picks up from the server's last confirmed byte instead of
// starting over.
async function uploadFileInChunks(
  file: File,
  title: string,
  mode: SubmissionMode
): Promise<void> {
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("video/") && contentType !== "application/octet-stream") {
    throw new Error("O arquivo enviado não parece ser um vídeo.");
  }

  let submissionId: string | null = null;
  let chunkSize = 0;
  let startChunkIndex = 0;

  const saved = loadResumeState();
  if (
    saved &&
    saved.fileName === file.name &&
    saved.fileSize === file.size &&
    saved.fileLastModified === file.lastModified
  ) {
    // Ask the server for ground truth instead of trusting the local record
    // blindly - the temp file could be gone (e.g. a VPS restart) since this
    // was last saved, or the submission could have already finished/failed
    // through some other path.
    const statusRes = await fetch(
      `/api/submissions/upload/status?submissionId=${encodeURIComponent(saved.submissionId)}`
    );
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (statusData.status === "BAIXANDO" && Number(statusData.totalBytes) === file.size) {
        submissionId = saved.submissionId;
        chunkSize = statusData.chunkSize;
        startChunkIndex = Math.floor(Number(statusData.uploadedBytes) / chunkSize);
      }
    }
  }

  if (!submissionId) {
    const params = new URLSearchParams({
      title,
      mode,
      fileName: file.name,
      contentType,
      totalBytes: String(file.size),
    });
    const initRes = await fetch(`/api/submissions/upload/init?${params.toString()}`, {
      method: "POST",
    });
    const initData = await initRes.json();
    if (!initRes.ok) throw new Error(initData.error ?? "Falha ao iniciar envio");
    submissionId = initData.submissionId as string;
    chunkSize = initData.chunkSize as number;
    startChunkIndex = 0;
    saveResumeState({
      submissionId,
      fileName: file.name,
      fileSize: file.size,
      fileLastModified: file.lastModified,
    });
  }

  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let index = startChunkIndex; index < totalChunks; index++) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(
          `/api/submissions/upload/chunk?submissionId=${encodeURIComponent(submissionId)}&index=${index}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunk,
          }
        );
        if (res.status === 404 || res.status === 409) {
          const data = await res.json().catch(() => ({}));
          throw new UploadFatalError(
            data.error ?? "Envio expirado ou inválido - comece novamente."
          );
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Falha ao enviar parte ${index + 1} de ${totalChunks}`);
        }
        break; // this chunk is done, move on to the next one
      } catch (err) {
        if (err instanceof UploadFatalError) {
          saveResumeState(null);
          throw err;
        }
        if (attempt >= MAX_CHUNK_RETRIES) {
          // Resume state stays in localStorage on purpose - see function
          // comment. The submission itself stays BAIXANDO on the server at
          // whatever byte it reached (dispatcher.ts eventually reaps it as
          // ERRO only after 1h with no further chunk activity).
          throw new Error(
            `Envio pausado na parte ${index + 1} de ${totalChunks} (conexão instável) - clique em enviar novamente para retomar de onde parou.`
          );
        }
        await sleep(Math.min(30000, 1000 * 2 ** attempt));
      }
    }
  }

  const completeRes = await fetch(
    `/api/submissions/upload/complete?submissionId=${encodeURIComponent(submissionId)}&fileName=${encodeURIComponent(file.name)}`,
    { method: "POST" }
  );
  const completeData = await completeRes.json();
  if (!completeRes.ok) throw new Error(completeData.error ?? "Falha ao finalizar envio");
  saveResumeState(null);
}

export default function SubmitForm() {
  const router = useRouter();
  const [contentType, setContentType] = useState<ContentType>("PREGACAO");
  const [sourceType, setSourceType] = useState<SourceType>("link");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [fullWordMode, setFullWordMode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setYoutubeUrl("");
    setTitle("");
    setFullWordMode(false);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const mode = resolveMode(contentType, fullWordMode);
    try {
      if (sourceType === "link") {
        const res = await fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl, title, mode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha ao enviar");
      } else {
        if (!file) throw new Error("Selecione um arquivo de vídeo");
        // Metadata rides the query string; the file itself goes up as a
        // sequence of PUT'd chunks (no multipart/form-data envelope
        // either) - see uploadFileInChunks() above for why (resumable,
        // survives a flaky connection) and the upload/{init,chunk,complete,
        // status} routes for the server side. Never buffered whole in
        // this process's memory or the server's either way.
        await uploadFileInChunks(file, title, mode);
      }
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={sourceType === "link" ? "pill-toggle pill-toggle-active" : "pill-toggle"}
            onClick={() => setSourceType("link")}
            style={{ flex: 1 }}
          >
            Link do YouTube
          </button>
          <button
            type="button"
            className={sourceType === "file" ? "pill-toggle pill-toggle-active" : "pill-toggle"}
            onClick={() => setSourceType("file")}
            style={{ flex: 1 }}
          >
            Enviar arquivo
          </button>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <label>Tipo de conteúdo *</label>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            role="radio"
            aria-checked={contentType === "PREGACAO"}
            className={contentType === "PREGACAO" ? "pill-toggle pill-toggle-active" : "pill-toggle"}
            onClick={() => setContentType("PREGACAO")}
          >
            Pregação
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={contentType === "PODCAST"}
            className={contentType === "PODCAST" ? "pill-toggle pill-toggle-active" : "pill-toggle"}
            onClick={() => setContentType("PODCAST")}
          >
            Podcast
          </button>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <label htmlFor="title">Título do vídeo</label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Podcast #58 - Convidado especial"
        />
      </div>

      {sourceType === "link" ? (
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="youtubeUrl">Link do YouTube</label>
          <input
            id="youtubeUrl"
            type="url"
            required
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>
      ) : (
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="videoFile">Arquivo de vídeo</label>
          {/* The native file input's own button/text can't be restyled
              consistently across browsers, so it's visually hidden and
              triggered via this styled box instead - matches the look of
              every other field on this form (dark box, border, rounded
              corners) instead of the browser's default grey button. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            style={{
              width: "100%",
              background: "#0a0a13",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: file ? "var(--text)" : "var(--text-dim)",
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            {file ? file.name : "Clique para selecionar um arquivo de vídeo"}
          </div>
          <input
            id="videoFile"
            ref={fileInputRef}
            type="file"
            required
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          />
        </div>
      )}

      {/* Palavra Completa only applies to Pregação - Podcast is always the
          multi-clip format (see design.md decision 2). Hiding this toggle
          when Podcast is selected instead of leaving it visible-but-inert
          avoids offering a choice that doesn't mean anything for that
          content type. */}
      {contentType === "PREGACAO" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>Modo Palavra Completa</div>
          <button
            type="button"
            role="switch"
            aria-checked={fullWordMode}
            aria-label="Modo Palavra Completa"
            onClick={() => setFullWordMode((v) => !v)}
            style={{
              position: "relative",
              width: 40,
              height: 22,
              flexShrink: 0,
              borderRadius: 999,
              border: "none",
              background: fullWordMode ? "#6199f6" : "var(--border)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: fullWordMode ? 20 : 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fcfcfc",
                transition: "left 0.15s",
              }}
            />
          </button>
        </div>
      )}

      {error && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      <button
        className="btn-primary"
        type="submit"
        disabled={loading}
        style={{ width: "auto", padding: "12px 24px" }}
      >
        {loading ? "Enviando..." : "Enviar"}
      </button>
    </form>
  );
}
