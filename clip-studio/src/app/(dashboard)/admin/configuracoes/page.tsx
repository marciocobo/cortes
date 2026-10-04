import { requireAdmin } from "@/lib/rbac";
import N8nConfigForm from "./N8nConfigForm";
import YoutubeCookieForm from "./YoutubeCookieForm";
import UserManagement from "./UserManagement";

export default async function ConfiguracoesPage() {
  await requireAdmin();
  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Administração</p>
          <h1>Configurações</h1>
        </div>
      </div>
      <div className="card form-card">
        <h2 className="card-title">Webhook N8N</h2>
        <N8nConfigForm />
      </div>
      <div className="card form-card">
        <h2 className="card-title">Cookie de sessão do YouTube</h2>
        <YoutubeCookieForm />
      </div>
      <UserManagement />
    </div>
  );
}
