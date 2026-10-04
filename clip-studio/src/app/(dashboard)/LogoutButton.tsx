"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button className="btn-link" onClick={() => signOut({ callbackUrl: "/login" })}>
      Sair
    </button>
  );
}
