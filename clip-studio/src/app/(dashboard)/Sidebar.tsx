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

export default function Sidebar({
  role,
  name,
  open,
  onToggle,
}: {
  role: Role;
  name: string;
  open: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const links = ALL_LINKS.filter((link) => (link.roles as readonly string[]).includes(role));

  return (
    <>
      <button className="hamburger-btn" aria-label="Menu" title="Menu" onClick={onToggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fcfcfc" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <aside className={open ? "sidebar sidebar-open" : "sidebar"}>
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
    </>
  );
}
