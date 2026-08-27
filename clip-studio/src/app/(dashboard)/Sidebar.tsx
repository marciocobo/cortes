"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import LogoutButton from "./LogoutButton";

const ALL_LINKS = [
  { href: "/videos", label: "Vídeos", roles: ["CLIPADOR", "ADMIN"] },
  { href: "/enviar", label: "Enviar Vídeo", roles: ["UPLOADER", "ADMIN"] },
  { href: "/admin/configuracoes", label: "Configurações", roles: ["ADMIN"] },
] as const;

export default function Sidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const links = ALL_LINKS.filter((link) => (link.roles as readonly string[]).includes(role));

  return (
    <aside className="sidebar">
      <div className="logo">Clip Studio</div>
      <nav>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname.startsWith(link.href) ? "active" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="user-box">
        <div style={{ marginBottom: 4 }}>{name}</div>
        <div style={{ color: "var(--accent-blue)", fontSize: "0.75rem", fontWeight: 600 }}>
          {role}
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}
