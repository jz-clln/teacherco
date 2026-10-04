import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeAccessRedirect } from "@/lib/auth/access-policy";
import type { AccessProfile } from "@/features/invites/types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Public content remains readable without an account or an auth service connection.
  const path = request.nextUrl.pathname;
  if (["/", "/.well-known/assetlinks.json", "/offline.html", "/legal/privacy", "/legal/terms", "/auth/confirm", "/api/health", "/sw.js", "/manifest.webmanifest"].includes(path)) {
    return response;
  }

  const gateStart = performance.now();
  let authMs = 0;
  let accessMs = 0;
  function withTiming(result: NextResponse) {
    result.headers.set("Server-Timing", `auth;dur=${authMs.toFixed(1)}, access;dur=${accessMs.toFixed(1)}, gate;dur=${(performance.now() - gateStart).toFixed(1)}`);
    return result;
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

  const authStart = performance.now();
  const { data: { user } } = await supabase.auth.getUser();
  authMs = performance.now() - authStart;
  const publicAuth = ["/login", "/signup", "/verify-email"].includes(path);
  let destination: string | null = null;
  if (!user) {
    if (!publicAuth) destination = "/login";
  } else {
    const accessStart = performance.now();
    const { data: profile, error } = await supabase.from("profiles")
      .select("access_status,role,onboarding_completed").eq("id", user.id).maybeSingle();
    accessMs = performance.now() - accessStart;
    // Fail closed instead of looping or treating an unavailable profile as active.
    if (error || !profile) {
      const unavailable = NextResponse.json({ error: "Could not verify account access. Please try again." }, { status: 503 });
      response.cookies.getAll().forEach((cookie) => unavailable.cookies.set(cookie));
      unavailable.headers.set("Cache-Control", "private, no-store");
      return withTiming(unavailable);
    }
    destination = routeAccessRedirect(path, !!user.email_confirmed_at, profile as AccessProfile);
    if (!destination && path.startsWith("/admin") && profile.role !== "admin") {
      return withTiming(new NextResponse("Administrator access required.", { status: 403, headers: { "Cache-Control": "private, no-store" } }));
    }
  }
  if (destination) {
    const blocked = path.startsWith("/api/")
      ? NextResponse.json({ error: "Account access required." }, { status: user ? 403 : 401 })
      : NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => blocked.cookies.set(cookie));
    blocked.headers.set("Cache-Control", "private, no-store");
    return withTiming(blocked);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return withTiming(response);
}
