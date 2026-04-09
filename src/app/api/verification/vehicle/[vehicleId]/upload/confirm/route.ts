import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

interface ConfirmBody {
  objectKey?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await params;
  const body = (await request.json().catch(() => null)) as ConfirmBody | null;
  const objectKey = str(body?.objectKey);
  const fileName = str(body?.fileName);
  const mimeType = str(body?.mimeType);
  const fileSizeBytes =
    typeof body?.fileSizeBytes === "number" ? body.fileSizeBytes : Number(body?.fileSizeBytes);

  if (!objectKey || !fileName || !mimeType || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "objectKey, fileName, mimeType, and a positive fileSizeBytes are required",
      },
      { status: 400 },
    );
  }

  const { data, error } = await actorResult.supabase.rpc(
    "verification_confirm_vehicle_rc_upload_v1",
    {
      p_vehicle_id: vehicleId,
      p_object_key: objectKey,
      p_file_name: fileName,
      p_mime_type: mimeType,
      p_file_size_bytes: fileSizeBytes,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_confirm_vehicle_rc_upload_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to confirm upload", error.code);
  }

  const payload = data as { success: boolean; data?: any } | null;
  return NextResponse.json({ ok: true, data: payload?.data });
}
