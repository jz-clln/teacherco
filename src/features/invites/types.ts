export type AccessStatus = "pending" | "active" | "suspended";
export type AccessProfile = { access_status: AccessStatus; role: "teacher" | "admin"; onboarding_completed: boolean; access_expires_at?: string | null };
export type InviteState = { error?: string; success?: string };
