import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

interface SummaryRow {
  trip_id: string;
  trip_code: string;
  trip_amount: number | string | null;
  current_stage: string;
  paid_advance_total: number | string | null;
  pending_advance_total: number | string | null;
  suggested_final_amount: number | string | null;
  paid_balance_total: number | string | null;
  is_trip_completed: boolean;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_payment_summary_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_payment_summary_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch trip payment summary", rpcError.code);
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as SummaryRow | undefined;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Trip payment summary not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      tripId: row.trip_id,
      tripCode: row.trip_code,
      tripAmount: toNumber(row.trip_amount),
      currentStage: row.current_stage,
      paidAdvanceTotal: toNumber(row.paid_advance_total),
      pendingAdvanceTotal: toNumber(row.pending_advance_total),
      suggestedFinalAmount: toNumber(row.suggested_final_amount),
      paidBalanceTotal: toNumber(row.paid_balance_total),
      isTripCompleted: Boolean(row.is_trip_completed),
    },
  });
}
