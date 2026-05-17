import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  requireTripRequestActor,
  mapTripRequestRpcError,
} from "@/app/api/trip-requests/_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const actorResult = await requireTripRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "requestId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim() || null;

  // sales_consigner can only cancel their own request; the RPC enforces this
  // inline via p_only_if_created_by so we avoid a second roundtrip.
  const onlyIfCreatedBy =
    actorResult.actor.role === "sales_consigner" ? actorResult.actor.id : null;

  const { error: rpcError } = await actorResult.supabase.rpc("trip_request_cancel_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_id: requestId,
    p_reason: reason,
    p_only_if_created_by: onlyIfCreatedBy,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_request_cancel_v1" },
        { status: 500 },
      );
    }
    return mapTripRequestRpcError(rpcError.message ?? "Unable to cancel trip request", rpcError.code);
  }

  return NextResponse.json({ ok: true, data: { id: requestId, status: "cancelled" } });
}
