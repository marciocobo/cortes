"use client";

import { useEffect, useState } from "react";

type Role = "CLIPADOR" | "UPLOADER" | "ADMIN";
type User = { id: string; name: string; email: string; role: Role; active: boolean };

export default function UserManagement() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("CLIPADOR");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<{ email: string; password: string } | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (res.ok) setUsers(data.users);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see VideoLibrary.tsx
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setJustCreated(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar usuário");
      setJustCreated({ email, password: data.initialPassword });
      setName("");
      setEmail("");
      setRole("CLIPADOR");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar usuário");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(user: User, newRole: Role) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  async function toggleActive(user: User) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    await load();
  }

  return (
    <div>
      <h2 className="card-title">Usuários</h2>

      {justCreated && (
        <div className="callout-success">
          Usuário <strong>{justCreated.email}</strong> criado. Senha inicial (compartilhe com a pessoa, isso não
          aparece de novo): <code>{justCreated.password}</code>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {users === null ? (
        <p className="loading-text">Carregando...</p>
      ) : (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nome">{u.name}</td>
                  <td data-label="E-mail">{u.email}</td>
                  <td data-label="Perfil">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                      className="select"
                    >
                      <option value="CLIPADOR">Clipador</option>
                      <option value="UPLOADER">Uploader</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td data-label="Status">{u.active ? "Ativo" : "Desativado"}</td>
                  <td data-label="">
                    <button className="btn-secondary btn-sm" onClick={() => toggleActive(u)}>
                      {u.active ? "Desativar" : "Reativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card card-pad">
        <p className="section-label">Adicionar usuário</p>
        <form onSubmit={handleCreate} className="inline-form">
          <input
            placeholder="Nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
          <input
            placeholder="E-mail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="select">
            <option value="CLIPADOR">Clipador</option>
            <option value="UPLOADER">Uploader</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button className="btn-primary" type="submit" disabled={busy}>
            Adicionar
          </button>
        </form>
      </div>
    </div>
  );
}
