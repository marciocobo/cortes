import { requireAdmin } from "@/lib/rbac";
import N8nConfigForm from "./N8nConfigForm";
import YoutubeCookieForm from "./YoutubeCookieForm";
import UserManagement from "./UserManagement";

export default async function ConfiguracoesPage() {
  await requireAdmin();
  return (
    <div>
      <p className="eyebrow">Administração</p>
      <h1 style={{ marginTop: 0 }}>Configurações</h1>
      <div className="card" style={{ padding: 24, maxWidth: 560, marginBottom: 32 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Webhook N8N</h2>
        <N8nConfigForm />
      </div>
      <div className="card" style={{ padding: 24, maxWidth: 560, marginBottom: 32 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Cookie de sessão do YouTube</h2>
        <YoutubeCookieForm />
      </div>
      <UserManagement />
    </div>
  );
}
