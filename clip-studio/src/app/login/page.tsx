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
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "40px 32px",
          border: "1px solid #4f4f80",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
        }}
      >
        <p className="eyebrow">Clip Studio</p>
        <h1 style={{ margin: "0 0 24px", fontSize: "30px", letterSpacing: "-0.9px" }}>Entrar</h1>
        <LoginForm />
      </div>
    </div>
  );
}
