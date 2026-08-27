"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      style={{
        display: "block",
        marginTop: 8,
        padding: 0,
        background: "transparent",
        border: "none",
        color: "var(--text-dim)",
        textAlign: "left",
        cursor: "pointer",
      }}
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Sair
    </button>
  );
}
