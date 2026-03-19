import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireDeliveryRequestActor, mapRpcError } from "@/app/api/delivery-requests/_shared";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const actorResult = await requireDeliveryRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "Request ID is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "auction_detail_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_request_id: requestId,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: auction_detail_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch auction detail", rpcError.code);
  }

  const result = rpcData as {
    request: Record<string, unknown>;
    bids: Array<Record<string, unknown>>;
    winner_selection: Record<string, unknown> | null;
    erp_metadata: Record<string, unknown> | null;
  } | null;

  if (!result) {
    return NextResponse.json({ ok: false, message: "Auction not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: result });
}
