"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type Submission = {
  id: string;
  youtubeUrl: string;
  title: string;
  status: "FILA" | "BAIXANDO" | "PROCESSANDO" | "CONCLUIDO" | "ERRO";
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
  submittedBy: { name: string };
};

type Attempt = {
  id: string;
  status: Submission["status"];
  errorReason: string | null;
  occurredAt: string;
};

const STATUS_LABEL: Record<Submission["status"], string> = {
  FILA: "Na fila",
  BAIXANDO: "Baixando",
  PROCESSANDO: "Processando",
  CONCLUIDO: "Concluído",
  ERRO: "Erro",
};

const STATUS_PILL_CLASS: Record<Submission["status"], string> = {
  FILA: "pill pill-fila",
  BAIXANDO: "pill pill-baixando",
  PROCESSANDO: "pill pill-processando",
  CONCLUIDO: "pill pill-concluido",
  ERRO: "pill pill-erro",
};

// Same hand-rolled inline-SVG icon style as VideoLibrary.tsx's ICON_PROPS -
// see that file's comment for why (no icon library dependency for one icon).
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ReprocessIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 21v-5h5" />
    </svg>
  );
}

// Same overlay pattern as VideoLibrary.tsx's ModalOverlay (dark backdrop,
// #4f4f80 border, 10px radius) - kept local here since neither file shares
// a components module today and this is the only modal on this page.
function ModalOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid #4f4f80",
          borderRadius: 10,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// youtube-ingestion spec: "Submission attempt history" - opened by clicking
// an Erro status pill, lists every past (reprocessed-away) failure for that
// submission, most recent first.
function AttemptHistoryModal({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${submission.id}/attempts`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Falha ao carregar histórico");
        setAttempts(data.attempts);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar histórico");
      });
    return () => {
      cancelled = true;
    };
  }, [submission.id]);

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Histórico de tentativas</div>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>{submission.title}</p>

      {error && <p className="error-text">{error}</p>}
      {!error && attempts === null && <p style={{ color: "var(--text-dim)" }}>Carregando...</p>}
      {!error && attempts !== null && attempts.length === 0 && submission.status !== "ERRO" && (
        <p style={{ color: "var(--text-dim)" }}>Nenhuma tentativa anterior.</p>
      )}
      {!error && attempts !== null && (attempts.length > 0 || submission.status === "ERRO") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 320, overflowY: "auto" }}>
          {/* Current failure isn't in the attempts table yet - that only
              gets a row once this submission is reprocessed (see
              youtube-ingestion spec, "Submission attempt history"). Show it
              here so the error reason removed from the main table row (per
              user feedback) is still visible somewhere. */}
          {submission.status === "ERRO" && (
            <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <div style={{ fontSize: 12, color: "var(--status-erro)", marginBottom: 4 }}>
                {new Date(submission.updatedAt).toLocaleString("pt-BR")} — atual
              </div>
              <div style={{ fontSize: 13 }}>{submission.errorReason ?? "Sem motivo registrado"}</div>
            </div>
          )}
          {attempts.map((a) => (
            <div key={a.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>
                {new Date(a.occurredAt).toLocaleString("pt-BR")}
              </div>
              <div style={{ fontSize: 13 }}>{a.errorReason ?? "Sem motivo registrado"}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button
          onClick={onClose}
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
          Fechar
        </button>
      </div>
    </ModalOverlay>
  );
}

export default function SubmissionHistory() {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<Submission | null>(null);

  async function load() {
    const res = await fetch("/api/submissions");
    if (!res.ok) return;
    const data = await res.json();
    setSubmissions(data.submissions);
  }

  useEffect(() => {
    // Reflects real pipeline state on a short poll instead of the
    // prototype's simulated status timers - see youtube-ingestion spec,
    // "Submission status tracking".
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see VideoLibrary.tsx
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  // youtube-ingestion spec: "Reprocess a failed submission" - re-queues the
  // same submission without re-entering title/link. GET /api/submissions
  // already scopes rows to submissions this viewer may act on (own, or any
  // if Admin - see "Submission history"), so any Erro row rendered here is
  // one this viewer is allowed to reprocess; the endpoint re-checks anyway.
  async function handleReprocess(id: string) {
    setReprocessingId(id);
    setReprocessError(null);
    try {
      const res = await fetch(`/api/submissions/${id}/reprocess`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao reprocessar");
      await load();
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : "Falha ao reprocessar");
    } finally {
      setReprocessingId(null);
    }
  }

  if (submissions === null) return <p style={{ color: "var(--text-dim)" }}>Carregando...</p>;
  if (submissions.length === 0) return <p className="empty-state">Nenhum envio ainda.</p>;

  return (
    <div>
      {reprocessError && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          {reprocessError}
        </p>
      )}
      <div className="card" style={{ overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Vídeo</th>
              <th>Link</th>
              <th>Enviado por</th>
              <th>Data / Status</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td data-label="Vídeo">{s.title}</td>
                <td data-label="Link">
                  <a href={s.youtubeUrl} target="_blank" rel="noreferrer">
                    {s.youtubeUrl}
                  </a>
                </td>
                <td data-label="Enviado por">{s.submittedBy.name}</td>
                <td data-label="Data / Status">
                  <div>{new Date(s.createdAt).toLocaleString("pt-BR")}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    {s.status === "ERRO" ? (
                      <button
                        type="button"
                        className={STATUS_PILL_CLASS[s.status]}
                        onClick={() => setHistoryFor(s)}
                        style={{ border: "none", cursor: "pointer" }}
                        title="Ver histórico de tentativas"
                      >
                        {STATUS_LABEL[s.status]}
                      </button>
                    ) : (
                      <span className={STATUS_PILL_CLASS[s.status]}>{STATUS_LABEL[s.status]}</span>
                    )}
                    {s.status === "ERRO" && (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => handleReprocess(s.id)}
                        disabled={reprocessingId === s.id}
                        title="Reprocessar"
                      >
                        <ReprocessIcon />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {historyFor && <AttemptHistoryModal submission={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
