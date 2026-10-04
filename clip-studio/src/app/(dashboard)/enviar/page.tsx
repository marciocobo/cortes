import { requireCapability } from "@/lib/rbac";
import SubmitForm from "./SubmitForm";
import SubmissionHistory from "./SubmissionHistory";

export default async function EnviarPage() {
  await requireCapability("youtubeIngestion");
  return (
    <div>
      <p className="eyebrow">Automação</p>
      <h1>Enviar Vídeo</h1>
      <p className="page-intro">Cole o link do vídeo completo do YouTube ou envie o arquivo.</p>
      <div className="card form-card">
        <SubmitForm />
      </div>
      <h2 className="section-label">Histórico de envios</h2>
      <SubmissionHistory />
    </div>
  );
}
