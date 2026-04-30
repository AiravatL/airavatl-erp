import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { REPORT_ROLES } from "@/app/api/reports/_shared";

export async function GET() {
  const actorResult = await requireServerActor(REPORT_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_operations_health_v1",
    { p_actor_user_id: actorResult.actor.id } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_operations_health_v1" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to fetch operations health" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: rpcData ?? {} });
}
