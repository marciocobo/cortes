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
      <div className="field" style={{ marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={fullWordMode}
            onChange={(e) => setFullWordMode(e.target.checked)}
          />
          Modo Palavra Completa
        </label>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 4 }}>
          Em vez de vários Shorts, gera um único clipe contínuo com a pregação
          inteira (do início ao fim, sem abertura/avisos/dízimo/louvor/encerramento),
          mantendo o formato original do vídeo (sem corte 9:16) e atenuando
          música/teclado de fundo de forma aproximada.
        </p>
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
