import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "./Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="app-shell">
      <Sidebar role={session.user.role} name={session.user.name} />
      <main className="main">{children}</main>
    </div>
  );
}
