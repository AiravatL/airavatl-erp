import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError } from "@/app/api/trips/_shared";
import { requirePaymentActor } from "@/app/api/payments/_shared";

interface UploadRow {
  status: "prepared" | "uploaded" | "attached" | "expired" | "missing";
  object_key: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_at: string | null;
  attached_at: string | null;
  source: "draft" | "final" | "none";
}

interface RpcResult {
  upload: UploadRow | null;
}

function normalizeUpload(upload: UploadRow | null | undefined) {
  if (!upload) {
    return {
      status: "missing" as const,
      objectKey: null,
      fileName: null,
      mimeType: null,
      fileSizeBytes: null,
      uploadedAt: null,
      attachedAt: null,
      source: "none" as const,
    };
  }

  return {
    status: upload.status,
    objectKey: upload.object_key,
    fileName: upload.file_name,
    mimeType: upload.mime_type,
    fileSizeBytes: upload.file_size_bytes,
    uploadedAt: upload.uploaded_at,
    attachedAt: upload.attached_at,
    source: upload.source,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentRequestId: string }> },
) {
  const actorResult = await requirePaymentActor();
  if ("error" in actorResult) return actorResult.error;

  const { paymentRequestId } = await params;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_payment_proof_get_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_payment_request_id: paymentRequestId,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_payment_proof_get_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch payment proof upload", rpcError.code);
  }

  const result = (rpcData ?? null) as RpcResult | null;

  return NextResponse.json({
    ok: true,
    data: normalizeUpload(result?.upload),
  });
}
