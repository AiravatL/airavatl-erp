import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireDeliveryRequestActor, mapRpcError } from "@/app/api/delivery-requests/_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const actorResult = await requireDeliveryRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "Request ID is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    bid_id?: string;
    consigner_trip_amount?: number;
  } | null;

  if (!body?.bid_id) {
    return NextResponse.json({ ok: false, message: "Bid ID is required" }, { status: 400 });
  }
  if (!body.consigner_trip_amount || body.consigner_trip_amount <= 0) {
    return NextResponse.json({ ok: false, message: "Consigner trip amount must be greater than 0" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "auction_select_winner_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_request_id: requestId,
      p_bid_id: body.bid_id,
      p_consigner_trip_amount: body.consigner_trip_amount,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: auction_select_winner_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to select winner", rpcError.code);
  }

  const result = rpcData as {
    success: boolean;
    trip_id: string;
    trip_number: string;
    pickup_otp: string;
    bid_amount: number;
    consigner_trip_amount: number;
  } | null;

  if (!result?.trip_id) {
    return NextResponse.json({ ok: false, message: "Failed to create trip" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      trip_id: result.trip_id,
      trip_number: result.trip_number,
      pickup_otp: result.pickup_otp,
      bid_amount: result.bid_amount,
      consigner_trip_amount: result.consigner_trip_amount,
    },
  });
}
