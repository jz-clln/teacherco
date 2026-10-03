import { AppShell } from "@/components/layout/app-shell";
import { requireAccess } from "@/lib/auth/access-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAccess({ onboarded: true });
  return <AppShell>{children}</AppShell>;
}
