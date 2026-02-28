import { NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

const TICKET_ALLOWED_ROLES: Role[] = [
  "super_admin",
  "admin",
  "operations_consigner",
  "operations_vehicles",
  "sales_vehicles",
  "sales_consigner",
  "accounts",
  "support",
];

export interface TicketActor {
  id: string;
  role: Role;
}

export async function requireTicketActor() {
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
    return { error: mapTicketRpcError(rpcError.message ?? "Unauthorized", rpcError.code) };
  }

  if (!role) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const actor = { id: user.id, role: role as Role } satisfies TicketActor;

  if (!TICKET_ALLOWED_ROLES.includes(actor.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, actor };
}

export function mapTicketRpcError(message: string, code?: string) {
  if (message?.includes("permission_denied")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (message?.includes("actor_not_found")) return NextResponse.json({ ok: false, message: "User not found" }, { status: 401 });
  if (message?.includes("actor_inactive")) return NextResponse.json({ ok: false, message: "User account is inactive" }, { status: 403 });
  if (message?.includes("ticket_not_found")) return NextResponse.json({ ok: false, message: "Ticket not found" }, { status: 404 });
  if (message?.includes("invalid_ticket_status")) {
    return NextResponse.json({ ok: false, message: "Invalid ticket status" }, { status: 400 });
  }
  if (code === "22P02") return NextResponse.json({ ok: false, message: "Invalid request data" }, { status: 400 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
