import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Default view per role - see auth-rbac spec, "Successful login".
  if (session.user.role === "UPLOADER") redirect("/enviar");
  redirect("/videos");
}
