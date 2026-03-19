import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore.
            // The middleware will refresh the session.
          }
        },
      },
    },
  );

  // Proxy: intercept .rpc() calls to route them through the erp schema,
  // while keeping .from(), .auth, .storage etc. on the default public schema.
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "rpc") {
        return (...args: Parameters<typeof target.rpc>) =>
          target.schema("erp").rpc(...args);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
