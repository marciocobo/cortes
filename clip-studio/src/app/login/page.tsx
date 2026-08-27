import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: 32 }}>
        <p className="eyebrow">Clip Studio</p>
        <h1 style={{ margin: "0 0 24px", fontSize: "1.6rem" }}>Entrar</h1>
        <LoginForm />
      </div>
    </div>
  );
}
