import { z } from "zod";

export const INVALID_INVITE = "Invalid or unavailable invite code.";
export const inviteCodeSchema = z.string().regex(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
export const requestAccessSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(254),
  message: z.string().trim().max(1000),
});

// Only format a single alphanumeric keystroke. Pasted/replaced text is left intact
// so missing hyphens, extra hyphens, spaces, and malformed structures are rejected.
export function formatInviteKeystroke(previous: string, next: string, inputType: string) {
  if (inputType !== "insertText" || next.length !== previous.length + 1) return next;
  if (!/^[A-Za-z0-9-]*$/.test(next) || !/^[A-Za-z0-9]$/.test(next.at(-1)!)) return next;
  const raw = next.replaceAll("-", "");
  if (raw.length > 12) return previous;
  const prefix = previous.replaceAll("-", "").match(/.{1,4}/g)?.join("-") ?? "";
  if (previous !== prefix && previous !== `${prefix}-`) return next;
  return raw.match(/.{1,4}/g)?.join("-") ?? "";
}
