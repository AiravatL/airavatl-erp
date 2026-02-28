import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // API routes handle their own auth. Skip middleware auth calls to avoid
  // extra Supabase requests on every API hit.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Use getSession() for routing decisions — reads cookies locally, no network call.
  // This prevents ETIMEDOUT errors from blocking page navigation.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Try to refresh the token in the background (network call).
  // If it fails (e.g. network down), we still let the user through
  // based on their existing session cookie.
  try {
    await supabase.auth.getUser();
  } catch {
    // Network error — ignore, session cookie is still valid
  }

  // Unauthenticated users trying to access app routes → redirect to login
  if (!session && !pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated users on login page → redirect to dashboard
  if (session && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
