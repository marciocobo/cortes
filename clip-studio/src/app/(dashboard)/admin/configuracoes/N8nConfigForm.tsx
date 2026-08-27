"use client";

import { useEffect, useState } from "react";

export default function N8nConfigForm() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [secretAlreadySet, setSecretAlreadySet] = useState(false);
  const [stuckThresholdHours, setStuckThresholdHours] = useState(8);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((data) => {
        setWebhookUrl(data.config.n8nIngestWebhookUrl ?? "");
        setSecretAlreadySet(data.config.n8nWebhookSharedSecretSet);
        setStuckThresholdHours(data.config.stuckThresholdHours);
        setLoaded(true);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          n8nIngestWebhookUrl: webhookUrl || undefined,
          n8nWebhookSharedSecret: secret || undefined,
          stuckThresholdHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar");
      setSecret("");
      setSecretAlreadySet(true);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p style={{ color: "var(--text-dim)" }}>Carregando...</p>;

  return (
    <form onSubmit={handleSubmit}>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>URL base do webhook de ingestão do N8N</label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://n8n.mcobo.com.br/webhook"
        />
      </div>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Segredo compartilhado {secretAlreadySet && "(já configurado - deixe em branco para manter)"}</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={secretAlreadySet ? "••••••••" : ""}
        />
      </div>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Limite de tempo travado (horas)</label>
        <input
          type="number"
          min={1}
          max={72}
          value={stuckThresholdHours}
          onChange={(e) => setStuckThresholdHours(Number(e.target.value))}
        />
      </div>
      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
      {saved && <p style={{ color: "var(--status-concluido)", marginBottom: 12 }}>Salvo.</p>}
      <button className="btn-primary" type="submit" disabled={busy}>
        Salvar
      </button>
    </form>
  );
}
