import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError } from "@/app/api/trips/_shared";
import { requirePaymentActor } from "@/app/api/payments/_shared";

interface MarkPaidBody {
  objectKey?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
  paymentReference?: unknown;
  paidAmount?: unknown;
  notes?: unknown;
}

const MAX_AMOUNT = 1_000_000_000_000;
const MAX_PAYMENT_REFERENCE = 120;
const MAX_NOTES = 500;

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentRequestId: string }> },
) {
  const actorResult = await requirePaymentActor();
  if ("error" in actorResult) return actorResult.error;

  const { paymentRequestId } = await params;
  const body = (await request.json().catch(() => null)) as MarkPaidBody | null;
  const objectKey = toTrimmedString(body?.objectKey);
  const fileName = toTrimmedString(body?.fileName);
  const mimeType = toTrimmedString(body?.mimeType);
  const fileSizeBytes = toNumber(body?.fileSizeBytes);
  const paymentReference = toTrimmedString(body?.paymentReference);
  const notes = toTrimmedString(body?.notes);
  const paidAmount = toNumber(body?.paidAmount);

  if (!objectKey || !fileName || !mimeType || fileSizeBytes === null) {
    return NextResponse.json(
      { ok: false, message: "objectKey, fileName, mimeType, fileSizeBytes are required" },
      { status: 400 },
    );
  }
  if (paymentReference.length > MAX_PAYMENT_REFERENCE) {
    return NextResponse.json({ ok: false, message: "paymentReference is too long" }, { status: 400 });
  }
  if (notes.length > MAX_NOTES) {
    return NextResponse.json({ ok: false, message: "notes is too long" }, { status: 400 });
  }
  if (paidAmount !== null && (paidAmount <= 0 || paidAmount > MAX_AMOUNT)) {
    return NextResponse.json({ ok: false, message: "paidAmount is out of range" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_payment_mark_paid_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_payment_request_id: paymentRequestId,
    p_object_key: objectKey,
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_file_size_bytes: fileSizeBytes,
    p_payment_reference: paymentReference || null,
    p_paid_amount: paidAmount,
    p_notes: notes || null,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_payment_mark_paid_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to mark payment request as paid", rpcError.code);
  }

  return NextResponse.json({ ok: true, data: rpcData ?? null });
}
