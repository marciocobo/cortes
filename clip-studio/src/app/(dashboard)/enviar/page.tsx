import { requireCapability } from "@/lib/rbac";
import SubmitForm from "./SubmitForm";
import SubmissionHistory from "./SubmissionHistory";

export default async function EnviarPage() {
  await requireCapability("youtubeIngestion");
  return (
    <div>
      <p className="eyebrow">Automação</p>
      <h1 style={{ marginTop: 0 }}>Enviar Vídeo</h1>
      <p style={{ color: "var(--text-dim)", maxWidth: 480 }}>
        Cole o link do vídeo completo do YouTube.
      </p>
      <div className="card" style={{ padding: 24, maxWidth: 480, marginBottom: 32 }}>
        <SubmitForm />
      </div>
      <h2>Histórico de envios</h2>
      <SubmissionHistory />
    </div>
  );
}
