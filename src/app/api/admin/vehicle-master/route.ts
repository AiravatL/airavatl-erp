import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export async function GET(request: Request) {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "vehicle_master_list_v1",
    { p_actor_user_id: actorResult.actor.id, p_include_inactive: includeInactive } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vehicle_master_list_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to fetch vehicle master" }, { status: 500 });
  }

  const result = (rpcData ?? { vehicles: [], segments: [] }) as { vehicles: unknown[]; segments: unknown[] };
  return NextResponse.json({ ok: true, data: result });
}
