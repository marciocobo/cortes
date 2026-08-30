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
      <Sidebar role={role} name={name} open={open} onToggle={() => setOpen((v) => !v)} />
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <main className={open ? "main main-shifted" : "main"}>{children}</main>
    </>
  );
}
