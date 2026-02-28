import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

interface TimelineRow {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  actor_name: string;
  event_at: string;
  details: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_timeline_list_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_limit: 200,
    p_offset: 0,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_timeline_list_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch trip timeline", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as TimelineRow[];
  return NextResponse.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      entity: row.entity,
      entityId: row.entity_id,
      action: row.action,
      actorName: row.actor_name || "Unknown",
      timestamp: row.event_at,
      details: row.details || "Updated",
    })),
  });
}
