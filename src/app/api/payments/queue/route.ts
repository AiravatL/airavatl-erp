import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError } from "@/app/api/trips/_shared";
import { requirePaymentActor } from "@/app/api/payments/_shared";

interface QueueRow {
  id: string;
  trip_id: string;
  trip_code: string;
  trip_current_stage: string;
  type: string;
  status: string;
  amount: number | string;
  paid_amount: number | string | null;
  trip_amount: number | string | null;
  beneficiary: string | null;
  payment_method: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  upi_id: string | null;
  upi_qr_object_key: string | null;
  paid_proof_object_key: string | null;
  payment_reference: string | null;
  notes: string | null;
  requested_by_id: string;
  requested_by_name: string | null;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const actorResult = await requirePaymentActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const type = searchParams.get("type")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 100);
  const offset = Number(searchParams.get("offset") ?? 0);

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_payment_queue_list_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_status: status,
    p_type: type,
    p_search: search,
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 100,
    p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_payment_queue_list_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch payment queue", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as QueueRow[];
  const normalized = rows.map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    tripCode: row.trip_code,
    tripCurrentStage: row.trip_current_stage,
    type: row.type,
    status: row.status,
    amount: toNumber(row.amount) ?? 0,
    paidAmount: toNumber(row.paid_amount),
    tripAmount: toNumber(row.trip_amount),
    beneficiary: row.beneficiary ?? "",
    paymentMethod: row.payment_method,
    bankAccountHolder: row.bank_account_holder,
    bankAccountNumber: row.bank_account_number,
    bankIfsc: row.bank_ifsc,
    bankName: row.bank_name,
    upiId: row.upi_id,
    upiQrObjectKey: row.upi_qr_object_key,
    paidProofObjectKey: row.paid_proof_object_key,
    paymentReference: row.payment_reference,
    notes: row.notes ?? "",
    requestedById: row.requested_by_id,
    requestedByName: row.requested_by_name ?? "",
    reviewedById: row.reviewed_by_id,
    reviewedByName: row.reviewed_by_name ?? "",
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ ok: true, data: normalized });
}
