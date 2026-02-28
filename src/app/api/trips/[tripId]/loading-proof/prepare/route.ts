import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";
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

const WORKER_DOC_TYPE = "loading";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const body = (await request.json().catch(() => null)) as PrepareBody | null;
  const fileName = toTrimmedString(body?.fileName);
  const mimeType = toTrimmedString(body?.mimeType);
  const fileSizeBytes = toNumber(body?.fileSizeBytes);
  const fileExt = fileName ? extractFileExt(fileName) : null;

  if (!fileName || !mimeType || fileSizeBytes === null || !fileExt) {
    return NextResponse.json({ ok: false, message: "fileName, mimeType, fileSizeBytes are required" }, { status: 400 });
  }

  const prepareResult = await actorResult.supabase.rpc("trip_loading_proof_prepare_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_file_size_bytes: fileSizeBytes,
  } as never);

  if (prepareResult.error) {
    if (isMissingRpcError(prepareResult.error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_loading_proof_prepare_v1" }, { status: 500 });
    }
    return mapRpcError(prepareResult.error.message ?? "Unable to prepare loading proof upload", prepareResult.error.code);
  }

  const prepared = (prepareResult.data ?? null) as { object_key?: string } | null;
  const canonicalObjectKey = typeof prepared?.object_key === "string" ? prepared.object_key : null;
  if (!canonicalObjectKey) {
    return NextResponse.json({ ok: false, message: "Unable to prepare loading proof upload" }, { status: 500 });
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

  const presignResponse = await fetch(`${workerConfig.baseUrl}/presign/put`, {
    method: "POST",
    headers: buildR2WorkerHeaders(accessToken),
    body: JSON.stringify({
      tripId,
      docType: WORKER_DOC_TYPE,
      fileExt,
      objectKey: canonicalObjectKey,
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!presignResponse) {
    return NextResponse.json({ ok: false, message: "Unable to reach R2 presign worker" }, { status: 502 });
  }

  const payload = (await presignResponse.json().catch(() => null)) as WorkerPresignPutResponse | null;
  if (!presignResponse.ok || !payload?.upload_url) {
    return NextResponse.json(
      { ok: false, message: payload?.error || "Unable to prepare upload URL from worker" },
      { status: 502 },
    );
  }
  if (payload.object_key && payload.object_key !== canonicalObjectKey) {
    return NextResponse.json(
      { ok: false, message: "Worker returned unexpected object key. Please update worker to sign requested objectKey." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      uploadUrl: payload.upload_url,
      objectKey: canonicalObjectKey,
      expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
    },
  });
}
