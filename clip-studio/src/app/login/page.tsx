import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <p className="eyebrow">Clip Studio</p>
        <h1 className="login-title">Entrar</h1>
        <LoginForm />
      </div>
    </div>
  );
}
