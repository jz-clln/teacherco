import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeAccessRedirect } from "@/lib/auth/access-policy";
import type { AccessProfile } from "@/features/invites/types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Legal documents must remain readable without an account or an auth service connection.
  const path = request.nextUrl.pathname;
  if (["/legal/privacy", "/legal/terms", "/auth/confirm", "/api/health", "/sw.js", "/manifest.webmanifest"].includes(path)) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const publicAuth = ["/login", "/signup", "/verify-email"].includes(path);
  let destination: string | null = null;
  if (!user) {
    if (!publicAuth) destination = "/login";
  } else {
    const { data: profile, error } = await supabase.from("profiles")
      .select("access_status,role,onboarding_completed").eq("id", user.id).maybeSingle();
    // Fail closed instead of looping or treating an unavailable profile as active.
    if (error || !profile) {
      const unavailable = NextResponse.json({ error: "Could not verify account access. Please try again." }, { status: 503 });
      response.cookies.getAll().forEach((cookie) => unavailable.cookies.set(cookie));
      unavailable.headers.set("Cache-Control", "private, no-store");
      return unavailable;
    }
    destination = routeAccessRedirect(path, !!user.email_confirmed_at, profile as AccessProfile);
    if (!destination && path.startsWith("/admin") && profile.role !== "admin") {
      return new NextResponse("Administrator access required.", { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
  }
  if (destination) {
    const blocked = path.startsWith("/api/")
      ? NextResponse.json({ error: "Account access required." }, { status: user ? 403 : 401 })
      : NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => blocked.cookies.set(cookie));
    blocked.headers.set("Cache-Control", "private, no-store");
    return blocked;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
