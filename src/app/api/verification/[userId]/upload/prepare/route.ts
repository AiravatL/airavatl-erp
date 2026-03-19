import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";
import {
  buildR2WorkerHeaders,
  getR2WorkerConfig,
  type WorkerPresignPutResponse,
} from "@/lib/uploads/r2-worker";

interface PrepareBody {
  docType?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as PrepareBody | null;
  const docType = toTrimmedString(body?.docType);
  const fileName = toTrimmedString(body?.fileName);
  const mimeType = toTrimmedString(body?.mimeType);

  if (!docType || !fileName || !mimeType) {
    return NextResponse.json(
      { ok: false, message: "docType, fileName, and mimeType are required" },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "verification_prepare_upload_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_user_id: userId,
      p_doc_type: docType,
      p_file_name: fileName,
      p_mime_type: mimeType,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_prepare_upload_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to prepare upload", rpcError.code);
  }

  const prepared = (rpcData ?? null) as { object_key?: string } | null;
  const objectKey = typeof prepared?.object_key === "string" ? prepared.object_key : null;
  if (!objectKey) {
    return NextResponse.json({ ok: false, message: "Unable to prepare upload" }, { status: 500 });
  }

  const workerConfig = await getR2WorkerConfig();
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
    body: JSON.stringify({ objectKey }),
    cache: "no-store",
  }).catch(() => null);

  if (!presignResponse) {
    return NextResponse.json({ ok: false, message: "Unable to reach R2 presign worker" }, { status: 502 });
  }

  const payload = (await presignResponse.json().catch(() => null)) as WorkerPresignPutResponse | null;
  if (!presignResponse.ok || !payload?.upload_url) {
    return NextResponse.json(
      { ok: false, message: payload?.error || "Unable to prepare upload URL" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      uploadUrl: payload.upload_url,
      objectKey,
      expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
    },
  });
}
