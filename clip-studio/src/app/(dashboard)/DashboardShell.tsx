"use client";

import { useState } from "react";
import type { Role } from "@/generated/prisma/client";
import Sidebar from "./Sidebar";

export default function DashboardShell({
  role,
  name,
  children,
}: {
  role: Role;
  name: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Sidebar
        role={role}
        name={name}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        // Below 720px the drawer overlays the content (see globals.css), so
        // close it after a link tap; above that it pushes content and stays.
        onNavigate={() => {
          if (window.matchMedia("(max-width: 720px)").matches) setOpen(false);
        }}
      />
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <main className={open ? "main main-shifted" : "main"}>{children}</main>
    </>
  );
}
