import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  buildR2WorkerHeaders,
  getR2WorkerConfig,
  type WorkerPresignPutResponse,
} from "@/lib/uploads/r2-worker";

export const dynamic = "force-dynamic";

interface PrepareBody {
  fileName?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

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
  { params }: { params: Promise<{ id: string }> },
) {
  const actorResult = await requireServerActor(["super_admin", "admin", "accounts"]);
  if ("error" in actorResult) return actorResult.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as PrepareBody | null;
  const fileName = toTrimmedString(body?.fileName);
  const mimeType = toTrimmedString(body?.mimeType);
  const fileSizeBytes = toNumber(body?.fileSizeBytes);
  const fileExt = fileName ? extractFileExt(fileName) : null;

  if (!fileName || !mimeType || fileSizeBytes === null || !fileExt) {
    return NextResponse.json({ ok: false, message: "fileName, mimeType, fileSizeBytes are required" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase()) || !ALLOWED_EXTENSIONS.has(fileExt)) {
    return NextResponse.json({ ok: false, message: "Payment proof must be JPG, PNG, WEBP, or PDF" }, { status: 400 });
  }
  if (fileSizeBytes <= 0 || fileSizeBytes > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, message: "Payment proof size must be between 1 byte and 15 MB" }, { status: 400 });
  }

  const { data, error } = await actorResult.supabase.rpc(
    "receivable_collection_proof_prepare_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_receivable_id: id,
      p_consigner_profile_id: null,
      p_file_name: fileName,
      p_mime_type: mimeType,
      p_file_size_bytes: fileSizeBytes,
    } as never,
  );

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: error.message ?? "Unable to prepare payment proof upload" }, { status: 500 });
  }

  const prepared = (data ?? null) as { object_key?: string } | null;
  const objectKey = prepared?.object_key ?? null;
  if (!objectKey) {
    return NextResponse.json({ ok: false, message: "Unable to prepare payment proof upload" }, { status: 500 });
  }

  const workerConfig = await getR2WorkerConfig();
  const { data: sessionData } = await actorResult.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;
  if (!workerConfig) {
    return NextResponse.json({ ok: false, message: "Missing server config: R2_PRESIGN_WORKER_URL" }, { status: 500 });
  }
  if (!accessToken) {
    return NextResponse.json({ ok: false, message: "Missing worker auth context: no session access token" }, { status: 500 });
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
    return NextResponse.json({ ok: false, message: payload?.error || "Unable to prepare upload URL" }, { status: 502 });
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
