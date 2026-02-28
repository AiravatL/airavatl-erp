import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

export async function GET() {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_list_ops_vehicles_users_v1",
    { p_actor_user_id: actorResult.actor.id } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_list_ops_vehicles_users_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch users", rpcError.code);
  }

  interface UserRow { id: string; full_name: string }
  const rows = (Array.isArray(rpcData) ? rpcData : []) as UserRow[];
  const normalized = rows.map((r) => ({ id: r.id, fullName: r.full_name }));

  return NextResponse.json({ ok: true, data: normalized });
}
