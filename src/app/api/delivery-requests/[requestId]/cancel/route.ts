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

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "auction_cancel_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_request_id: requestId,
      p_reason: body?.reason ?? null,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: auction_cancel_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to cancel auction", rpcError.code);
  }

  const result = rpcData as { request_id: string; status: string } | null;

  return NextResponse.json({
    ok: true,
    data: {
      requestId: result?.request_id ?? requestId,
      status: result?.status ?? "cancelled",
    },
  });
}
