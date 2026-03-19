import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export interface ServerActorProfile {
  id: string;
  full_name: string;
  email?: string | null;
  role: Role;
  active: boolean;
}

export async function requireServerActor(allowedRoles?: readonly Role[]) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("auth_get_my_profile_v1");
  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return {
        error: NextResponse.json(
          { ok: false, message: "Missing RPC: auth_get_my_profile_v1" },
          { status: 500 },
        ),
      };
    }

    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const actor = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ServerActorProfile | null)
    : ((rpcData ?? null) as ServerActorProfile | null);

  if (!actor || !actor.active) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  if (allowedRoles?.length && !allowedRoles.includes(actor.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, actor };
}
