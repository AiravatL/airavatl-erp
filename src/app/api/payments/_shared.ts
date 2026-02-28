import { NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError } from "@/app/api/trips/_shared";

export const dynamic = "force-dynamic";

const PAYMENTS_ALLOWED_ROLES: Role[] = ["super_admin", "admin", "accounts"];

export interface PaymentActor {
  id: string;
  role: Role;
}

export async function requirePaymentActor() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const { data: role, error: rpcError } = await supabase.rpc("trip_assert_actor_v1", {
    p_actor_user_id: user.id,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return { error: NextResponse.json({ ok: false, message: "Missing RPC: trip_assert_actor_v1" }, { status: 500 }) };
    }
    return { error: mapRpcError(rpcError.message ?? "Unauthorized", rpcError.code) };
  }

  if (!role) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const actor = { id: user.id, role: role as Role } satisfies PaymentActor;

  if (!PAYMENTS_ALLOWED_ROLES.includes(actor.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, actor };
}
