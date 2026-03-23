import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

// Cloudflare's Next adapter currently supports Edge-style middleware, not the
// Node-oriented Next.js 16 proxy runtime.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
