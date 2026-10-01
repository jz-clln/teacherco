import { signOut } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
export const metadata = { title: "Settings" };
export default function SettingsPage() { return <div className="space-y-6"><div><p className="text-sm font-medium text-[#4F6F52]">SETTINGS</p><h1 className="mt-1 text-3xl font-bold">TeacherCo preferences</h1></div><Card><h2 className="font-semibold">Language</h2><p className="mt-2 text-sm text-[#606861]">English + Filipino support belongs here once the AI layer is connected.</p></Card><Card><h2 className="font-semibold">Privacy & data</h2><p className="mt-2 text-sm text-[#606861]">Class deletion, original-file retention, exports, and AI privacy controls should be visible—not hidden.</p></Card><form action={signOut}><Button type="submit" variant="secondary">Sign out</Button></form></div>; }
