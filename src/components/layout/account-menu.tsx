"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { ActionDisclosure } from "@/components/ui/action-disclosure";
import { signOut } from "@/features/auth/actions";

const item = "tc-button tc-quiet w-full justify-start text-left";
export function AccountMenu() {
  return <ActionDisclosure label="Account" icon={<UserRound size={20} aria-hidden />}>
    <Link className={item} href="/settings#profile">Profile</Link>
    <Link className={item} href="/settings">Settings</Link>
    <form action={signOut}><button type="submit" className={item}>Sign out</button></form>
  </ActionDisclosure>;
}
