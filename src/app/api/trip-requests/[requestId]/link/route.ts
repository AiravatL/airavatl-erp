import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  requireTripRequestActor,
  TRIP_REQUEST_OPS_ROLES,
  mapTripRequestRpcError,
} from "@/app/api/trip-requests/_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const actorResult = await requireTripRequestActor(TRIP_REQUEST_OPS_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "requestId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { deliveryRequestId?: string } | null;
  const deliveryRequestId = body?.deliveryRequestId?.trim();
  if (!deliveryRequestId) {
    return NextResponse.json(
      { ok: false, message: "deliveryRequestId is required" },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_request_link_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_id: requestId,
      p_delivery_request_id: deliveryRequestId,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_request_link_v1" },
        { status: 500 },
      );
    }
    return mapTripRequestRpcError(rpcError.message ?? "Unable to link trip request", rpcError.code);
  }

  const result = rpcData as {
    id: string;
    status: string;
    delivery_request_id: string;
  } | null;

  return NextResponse.json({
    ok: true,
    data: {
      id: result?.id ?? requestId,
      status: result?.status ?? "converted",
      deliveryRequestId: result?.delivery_request_id ?? deliveryRequestId,
    },
  });
}
