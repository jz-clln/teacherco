import {AccessBoundary} from '@/features/invites/components/access-boundary';
import {AttendanceSync} from '@/features/attendance/offline-sync';
import { AppShell } from "@/components/layout/app-shell";
import { requireAccess } from "@/lib/auth/access-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context=await requireAccess({ onboarded: true });
  return <AppShell><AttendanceSync owner={context.user.id}/><AccessBoundary profile={context.profile}>{children}</AccessBoundary></AppShell>;
}
