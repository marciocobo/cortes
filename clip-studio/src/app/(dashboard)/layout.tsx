import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import DashboardShell from "./DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="app-shell">
      <DashboardShell role={session.user.role} name={session.user.name}>
        {children}
      </DashboardShell>
    </div>
  );
}
