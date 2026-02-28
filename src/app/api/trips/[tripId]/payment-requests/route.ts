import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

interface PaymentRequestRow {
  id: string;
  trip_id: string;
  type: string;
  amount: number | string;
  beneficiary: string;
  status: string;
  notes: string | null;
  requested_by_id: string;
  requested_by_name: string | null;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  payment_method: string | null;
  upi_id: string | null;
  upi_qr_object_key: string | null;
}

function toNumber(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_payment_requests_list_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_payment_requests_list_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch payment requests", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as PaymentRequestRow[];
  const normalized = rows.map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    type: row.type,
    amount: toNumber(row.amount),
    beneficiary: row.beneficiary,
    status: row.status,
    notes: row.notes ?? "",
    requestedById: row.requested_by_id,
    requestedByName: row.requested_by_name ?? "",
    reviewedById: row.reviewed_by_id,
    reviewedByName: row.reviewed_by_name ?? "",
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    paymentMethod: row.payment_method,
    upiId: row.upi_id,
    upiQrObjectKey: row.upi_qr_object_key,
  }));

  return NextResponse.json({ ok: true, data: normalized });
}
