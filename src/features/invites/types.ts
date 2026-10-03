export type AccessStatus = "pending" | "active" | "suspended";
export type AccessProfile = { access_status: AccessStatus; role: "teacher" | "admin"; onboarding_completed: boolean };
export type InviteState = { error?: string; success?: string };
