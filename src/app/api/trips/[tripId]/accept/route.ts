import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_request_accept_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_request_accept_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to accept trip request", rpcError.code);
  }

  const result = rpcData as { trip_id: string; trip_code: string; ops_owner_id: string } | null;
  if (!result) {
    return NextResponse.json({ ok: false, message: "Unable to accept trip request" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: { tripId: result.trip_id, tripCode: result.trip_code, opsOwnerId: result.ops_owner_id },
  });
}
