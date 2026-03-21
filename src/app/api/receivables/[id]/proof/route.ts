import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface UploadRow {
  status: "prepared" | "uploaded" | "attached" | "expired" | "missing";
  object_key: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_at: string | null;
  attached_at: string | null;
  source: "draft" | "none";
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
  { params }: { params: Promise<{ id: string }> },
) {
  const actorResult = await requireServerActor(["super_admin", "admin", "accounts"]);
  if ("error" in actorResult) return actorResult.error;

  const { id } = await params;

  const { data, error } = await actorResult.supabase.rpc(
    "receivable_collection_proof_get_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_receivable_id: id,
      p_consigner_profile_id: null,
    } as never,
  );

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: error.message ?? "Unable to fetch payment proof upload" }, { status: 500 });
  }

  const result = (data ?? null) as RpcResult | null;
  return NextResponse.json({ ok: true, data: normalizeUpload(result?.upload) });
}
