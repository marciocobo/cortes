"use client";

import { useEffect, useState } from "react";

type Submission = {
  id: string;
  youtubeUrl: string;
  title: string;
  status: "FILA" | "BAIXANDO" | "PROCESSANDO" | "CONCLUIDO" | "ERRO";
  errorReason: string | null;
  createdAt: string;
  submittedBy: { name: string };
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

export default function SubmissionHistory() {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);

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

  if (submissions === null) return <p style={{ color: "var(--text-dim)" }}>Carregando...</p>;
  if (submissions.length === 0) return <p className="empty-state">Nenhum envio ainda.</p>;

  return (
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
                <span className={STATUS_PILL_CLASS[s.status]} style={{ marginTop: 4, display: "inline-block" }}>
                  {STATUS_LABEL[s.status]}
                </span>
                {s.status === "ERRO" && s.errorReason && (
                  <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: 4 }}>
                    {s.errorReason}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
