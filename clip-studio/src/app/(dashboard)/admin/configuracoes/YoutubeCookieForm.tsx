"use client";

import { useState } from "react";

type Result =
  | { ok: true; cookieCount?: number }
  | { ok: false; step: "bootstrap" | "validate"; reason?: string; detail?: string };

// admin-console spec: "YouTube cookie re-bootstrap" - lets an Admin
// re-bootstrap the ingestion pipeline's YouTube session cookie without an
// assisted SSH session, and reports one consolidated result reflecting a
// real yt-dlp validation, not just whether cookie-refresher accepted the
// submission - see openspec/changes/add-youtube-cookie-rebootstrap-ui.
export default function YoutubeCookieForm() {
  const [cookiesTxt, setCookiesTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/youtube-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookiesTxt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao processar o cookie");
      setResult(data);
      if (data.ok) setCookiesTxt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar o cookie");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field" style={{ marginBottom: 16 }}>
        <label htmlFor="cookiesTxt">Conteúdo do cookies.txt</label>
        <textarea
          id="cookiesTxt"
          required
          rows={6}
          value={cookiesTxt}
          onChange={(e) => setCookiesTxt(e.target.value)}
          placeholder="# Netscape HTTP Cookie File..."
          style={{
            width: "100%",
            background: "#0f0f12",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text)",
            padding: "10px 12px",
            fontFamily: "monospace",
            fontSize: 12,
            boxSizing: "border-box",
            resize: "vertical",
          }}
        />
      </div>
      {error && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {result && result.ok && (
        <p style={{ color: "var(--status-concluido)", marginBottom: 12 }}>
          ✅ Cookie válido e testado ({result.cookieCount ?? "?"} cookies).
        </p>
      )}
      {result && !result.ok && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          ❌ {result.step === "bootstrap" ? "Bootstrap falhou" : "Bootstrap ok, mas validação falhou"}:{" "}
          {result.reason ?? result.detail ?? "motivo desconhecido"}
        </p>
      )}
      <button
        className="btn-primary"
        type="submit"
        disabled={busy || !cookiesTxt.trim()}
        style={{ width: "auto", padding: "12px 24px" }}
      >
        {busy ? "Validando..." : "Atualizar cookie"}
      </button>
    </form>
  );
}
