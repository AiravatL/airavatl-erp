import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface ConfirmBody {
  consignerProfileId?: unknown;
  objectKey?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const actorResult = await requireServerActor(["super_admin", "admin", "accounts"]);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as ConfirmBody | null;
  const consignerProfileId = toTrimmedString(body?.consignerProfileId);
  const objectKey = toTrimmedString(body?.objectKey);
  const fileName = toTrimmedString(body?.fileName);
  const mimeType = toTrimmedString(body?.mimeType);
  const rawSize = body?.fileSizeBytes;
  const fileSizeBytes =
    typeof rawSize === "number" && Number.isFinite(rawSize)
      ? Math.trunc(rawSize)
      : typeof rawSize === "string" && Number.isFinite(Number(rawSize))
        ? Math.trunc(Number(rawSize))
        : Number.NaN;

  if (!consignerProfileId || !objectKey || !fileName || !mimeType || !(fileSizeBytes > 0)) {
    return NextResponse.json(
      { ok: false, message: "consignerProfileId, objectKey, fileName, mimeType, and fileSizeBytes are required" },
      { status: 400 },
    );
  }

  const { data, error } = await actorResult.supabase.rpc(
    "receivable_collection_proof_confirm_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_receivable_id: null,
      p_consigner_profile_id: consignerProfileId,
      p_object_key: objectKey,
      p_file_name: fileName,
      p_mime_type: mimeType,
      p_file_size_bytes: fileSizeBytes,
    } as never,
  );

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: error.message ?? "Unable to confirm payment proof upload" }, { status: 500 });
  }

  const result = (data ?? null) as { object_key?: string; uploaded_at?: string | null; status?: string | null } | null;
  return NextResponse.json({
    ok: true,
    data: {
      objectKey: result?.object_key ?? objectKey,
      uploadedAt: result?.uploaded_at ?? null,
      status: result?.status ?? null,
    },
  });
}
