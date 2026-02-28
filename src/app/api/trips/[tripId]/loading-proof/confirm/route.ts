import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

interface ConfirmBody {
  objectKey?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const body = (await request.json().catch(() => null)) as ConfirmBody | null;

  const objectKey = toTrimmedString(body?.objectKey);
  const fileName = toTrimmedString(body?.fileName);
  const mimeType = toTrimmedString(body?.mimeType);
  const fileSizeBytes = toNumber(body?.fileSizeBytes);

  if (!objectKey || !fileName || !mimeType || fileSizeBytes === null) {
    return NextResponse.json(
      { ok: false, message: "objectKey, fileName, mimeType, fileSizeBytes are required" },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_loading_proof_confirm_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_object_key: objectKey,
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_file_size_bytes: fileSizeBytes,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_loading_proof_confirm_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to confirm loading proof upload", rpcError.code);
  }

  return NextResponse.json({ ok: true, data: rpcData ?? null }, { status: 201 });
}
