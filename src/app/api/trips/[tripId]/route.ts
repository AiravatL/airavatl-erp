import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireTripActor, mapTripRpcError } from "@/app/api/trips/_shared";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_detail_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_trip_id: tripId,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_detail_v1" },
        { status: 500 },
      );
    }
    return mapTripRpcError(rpcError.message ?? "Unable to fetch trip", rpcError.code);
  }

  if (!rpcData) {
    return NextResponse.json({ ok: false, message: "Trip not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: rpcData });
}
