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
        // Metadata rides the query string and the request body is the raw
        // file bytes (no multipart/form-data envelope) - the browser
        // streams a File/Blob body directly instead of buffering it into a
        // FormData structure first, and /api/submissions/upload streams it
        // straight through without buffering either (see that route for
        // why: a multi-GB file must never sit fully in server memory).
        const params = new URLSearchParams({ title, mode, fileName: file.name });
        const res = await fetch(`/api/submissions/upload?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha ao enviar");
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
            className={sourceType === "link" ? "btn-primary" : "btn-secondary"}
            onClick={() => setSourceType("link")}
            style={{ flex: 1 }}
          >
            Link do YouTube
          </button>
          <button
            type="button"
            className={sourceType === "file" ? "btn-primary" : "btn-secondary"}
            onClick={() => setSourceType("file")}
            style={{ flex: 1 }}
          >
            Enviar arquivo
          </button>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <label>Tipo de conteúdo</label>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            role="radio"
            aria-checked={contentType === "PREGACAO"}
            className={contentType === "PREGACAO" ? "btn-primary" : "btn-secondary"}
            onClick={() => setContentType("PREGACAO")}
            style={{ flex: 1 }}
          >
            Pregação
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={contentType === "PODCAST"}
            className={contentType === "PODCAST" ? "btn-primary" : "btn-secondary"}
            onClick={() => setContentType("PODCAST")}
            style={{ flex: 1 }}
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
          <input
            id="videoFile"
            ref={fileInputRef}
            type="file"
            required
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
