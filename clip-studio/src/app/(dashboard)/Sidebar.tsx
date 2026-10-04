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

const ROLE_LABEL: Record<Role, string> = {
  CLIPADOR: "Clipador",
  UPLOADER: "Uploader",
  ADMIN: "Admin",
};

// Lucide-style stroke icons for the nav items (design-system
// assets/Icons: film, upload, settings) - purely decorative, the label
// beside each one carries the meaning.
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function NavIcon({ href }: { href: string }) {
  if (href === "/videos") {
    return (
      <svg {...ICON_PROPS}>
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    );
  }
  if (href === "/enviar") {
    return (
      <svg {...ICON_PROPS}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    );
  }
  return (
    <svg {...ICON_PROPS}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function Sidebar({
  role,
  name,
  open,
  onToggle,
  onNavigate,
}: {
  role: Role;
  name: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const links = ALL_LINKS.filter((link) => (link.roles as readonly string[]).includes(role));

  return (
    <>
      <button
        className="hamburger-btn"
        aria-label="Menu"
        title="Menu"
        aria-expanded={open}
        aria-controls="app-sidebar"
        onClick={onToggle}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <aside id="app-sidebar" className={open ? "sidebar sidebar-open" : "sidebar"}>
        <div className="logo">Clip Studio</div>
        <nav>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname.startsWith(link.href) ? "active" : undefined}
              onClick={onNavigate}
            >
              <NavIcon href={link.href} />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="user-box">
          <div className="user-name">{name}</div>
          <div className="user-role">{ROLE_LABEL[role]}</div>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
