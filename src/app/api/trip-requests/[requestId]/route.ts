import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  requireTripRequestActor,
  mapTripRequestRpcError,
} from "@/app/api/trip-requests/_shared";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const actorResult = await requireTripRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "requestId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_request_detail_v1",
    { p_id: requestId } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_request_detail_v1" },
        { status: 500 },
      );
    }
    return mapTripRequestRpcError(rpcError.message ?? "Unable to load trip request", rpcError.code);
  }

  const row = rpcData as Record<string, unknown> | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Trip request not found" }, { status: 404 });
  }

  // Sales sees only own
  if (
    actorResult.actor.role === "sales_consigner" &&
    row.created_by !== actorResult.actor.id
  ) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, data: row });
}
