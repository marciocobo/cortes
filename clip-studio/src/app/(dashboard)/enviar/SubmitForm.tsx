"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SubmitForm() {
  const router = useRouter();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [fullWordMode, setFullWordMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl,
          title,
          mode: fullWordMode ? "PALAVRA_COMPLETA" : "SHORTS",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao enviar");
      setYoutubeUrl("");
      setTitle("");
      setFullWordMode(false);
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
        <label htmlFor="title">Título do vídeo</label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
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
