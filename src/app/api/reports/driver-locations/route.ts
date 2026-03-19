import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { REPORT_ROLES } from "@/app/api/reports/_shared";

export async function GET(request: Request) {
  const actorResult = await requireServerActor(REPORT_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const onlineOnly = searchParams.get("onlineOnly") === "true";

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_driver_locations_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_online_only: onlineOnly,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_driver_locations_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to fetch driver locations" }, { status: 500 });
  }

  const result = (rpcData ?? {}) as { items?: unknown[] };
  return NextResponse.json({ ok: true, data: { items: result.items ?? [] } });
}
