import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError } from "@/app/api/trips/_shared";
import { requirePaymentActor } from "@/app/api/payments/_shared";

interface MarkPaidBody {
  objectKey?: unknown;
  paymentReference?: unknown;
  notes?: unknown;
}

const MAX_PAYMENT_REFERENCE = 120;
const MAX_NOTES = 500;

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
  const paymentReference = toTrimmedString(body?.paymentReference);
  const notes = toTrimmedString(body?.notes);

  if (paymentReference.length > MAX_PAYMENT_REFERENCE) {
    return NextResponse.json({ ok: false, message: "paymentReference is too long" }, { status: 400 });
  }
  if (notes.length > MAX_NOTES) {
    return NextResponse.json({ ok: false, message: "notes is too long" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_payment_mark_paid_v1" as string,
    {
      p_actor_user_id: actorResult.actor.id,
      p_payment_id: paymentRequestId,
      p_payment_reference: paymentReference || null,
      p_notes: notes || null,
      p_proof_object_key: objectKey || null,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_payment_mark_paid_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to mark payment as paid", rpcError.code);
  }

  return NextResponse.json({ ok: true, data: rpcData ?? null });
}
