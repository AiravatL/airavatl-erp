import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError } from "@/app/api/trips/_shared";
import { requirePaymentActor } from "@/app/api/payments/_shared";

interface ConfirmBody {
  objectKey?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
}

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
  const body = (await request.json().catch(() => null)) as ConfirmBody | null;
  const objectKey = toTrimmedString(body?.objectKey);
  const fileName = toTrimmedString(body?.fileName);
  const mimeType = toTrimmedString(body?.mimeType);
  const fileSizeBytes =
    typeof body?.fileSizeBytes === "number" && Number.isFinite(body.fileSizeBytes)
      ? Math.trunc(body.fileSizeBytes)
      : Number.NaN;

  if (!objectKey || !fileName || !mimeType || !(fileSizeBytes > 0)) {
    return NextResponse.json(
      { ok: false, message: "objectKey, fileName, mimeType, and fileSizeBytes are required" },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_payment_proof_confirm_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_payment_request_id: paymentRequestId,
      p_object_key: objectKey,
      p_file_name: fileName,
      p_mime_type: mimeType,
      p_file_size_bytes: fileSizeBytes,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_payment_proof_confirm_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to confirm payment proof upload", rpcError.code);
  }

  const result = (rpcData ?? null) as
    | { object_key?: string; uploaded_at?: string | null; status?: string | null }
    | null;

  return NextResponse.json({
    ok: true,
    data: {
      objectKey: result?.object_key ?? objectKey,
      uploadedAt: result?.uploaded_at ?? null,
      status: result?.status ?? null,
    },
  });
}
