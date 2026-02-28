import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError } from "@/app/api/trips/_shared";
import { requirePaymentActor } from "@/app/api/payments/_shared";
import {
  buildR2WorkerHeaders,
  getR2WorkerConfig,
  type WorkerPresignPutResponse,
} from "@/lib/uploads/r2-worker";

interface PrepareBody {
  fileName?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
}

const WORKER_DOC_TYPE = "payment-proof";
const MAX_PAYMENT_PROOF_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_PAYMENT_PROOF_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_PAYMENT_PROOF_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFileExt(fileName: string): string | null {
  const match = /(?:\.([^.]+))?$/.exec(fileName);
  const ext = match?.[1]?.toLowerCase() ?? "";
  return ext || null;
}

async function requestPresignPut(params: {
  workerUrl: string;
  accessToken: string | null;
  tripId: string;
  fileExt: string;
  objectKey: string;
}) {
  if (!params.accessToken) {
    return { ok: false } as const;
  }

  const response = await fetch(`${params.workerUrl.replace(/\/$/, "")}/presign/put`, {
    method: "POST",
    headers: buildR2WorkerHeaders(params.accessToken),
    body: JSON.stringify({
      tripId: params.tripId,
      docType: WORKER_DOC_TYPE,
      fileExt: params.fileExt,
      objectKey: params.objectKey,
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return { ok: false } as const;
  }

  const payload = (await response.json().catch(() => null)) as WorkerPresignPutResponse | null;
  if (response.ok && payload?.upload_url) {
    if (payload.object_key && payload.object_key !== params.objectKey) {
      return { ok: false } as const;
    }
    return {
      ok: true,
      uploadUrl: payload.upload_url,
      objectKey: params.objectKey,
      expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
    } as const;
  }

  return { ok: false } as const;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentRequestId: string }> },
) {
  const actorResult = await requirePaymentActor();
  if ("error" in actorResult) return actorResult.error;

  const { paymentRequestId } = await params;
  const body = (await request.json().catch(() => null)) as PrepareBody | null;
  const fileName = toTrimmedString(body?.fileName);
  const mimeType = toTrimmedString(body?.mimeType);
  const fileSizeBytes = toNumber(body?.fileSizeBytes);
  const fileExt = fileName ? extractFileExt(fileName) : null;

  if (!fileName || !mimeType || fileSizeBytes === null || !fileExt) {
    return NextResponse.json({ ok: false, message: "fileName, mimeType, fileSizeBytes are required" }, { status: 400 });
  }
  if (!ALLOWED_PAYMENT_PROOF_MIME_TYPES.has(mimeType.toLowerCase())) {
    return NextResponse.json(
      { ok: false, message: "Payment proof must be JPG, PNG, WEBP, or PDF" },
      { status: 400 },
    );
  }
  if (!ALLOWED_PAYMENT_PROOF_EXTENSIONS.has(fileExt)) {
    return NextResponse.json(
      { ok: false, message: "Payment proof file extension must be jpg, jpeg, png, webp, or pdf" },
      { status: 400 },
    );
  }
  if (fileSizeBytes <= 0 || fileSizeBytes > MAX_PAYMENT_PROOF_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Payment proof size must be between 1 byte and 15 MB" }, { status: 400 });
  }

  const { data: prepareData, error: prepareError } = await actorResult.supabase.rpc("trip_payment_proof_prepare_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_payment_request_id: paymentRequestId,
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_file_size_bytes: fileSizeBytes,
  } as never);

  if (prepareError) {
    if (isMissingRpcError(prepareError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_payment_proof_prepare_v1" }, { status: 500 });
    }
    return mapRpcError(prepareError.message ?? "Unable to prepare payment proof upload", prepareError.code);
  }

  const prepared = (prepareData ?? null) as { trip_id?: string; object_key?: string } | null;
  const tripId = prepared?.trip_id ?? null;
  const canonicalObjectKey = prepared?.object_key ?? null;
  if (!tripId || !canonicalObjectKey) {
    return NextResponse.json({ ok: false, message: "Unable to prepare payment proof upload" }, { status: 500 });
  }

  const workerConfig = getR2WorkerConfig();
  const { data: sessionData } = await actorResult.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;

  if (!workerConfig) {
    return NextResponse.json(
      { ok: false, message: "Missing server config: R2_PRESIGN_WORKER_URL" },
      { status: 500 },
    );
  }
  if (!accessToken) {
    return NextResponse.json(
      { ok: false, message: "Missing worker auth context: no session access token" },
      { status: 500 },
    );
  }

  const presigned = await requestPresignPut({
    workerUrl: workerConfig.baseUrl,
    accessToken,
    tripId,
    fileExt,
    objectKey: canonicalObjectKey,
  });

  if (!presigned.ok) {
    return NextResponse.json(
      { ok: false, message: "Unable to prepare upload URL from worker for payment proof" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      uploadUrl: presigned.uploadUrl,
      objectKey: presigned.objectKey,
      expiresIn: presigned.expiresIn,
    },
  });
}
