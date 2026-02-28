import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

interface ProofRow {
  id: string;
  trip_id: string;
  proof_type: string;
  object_key: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number | string;
  uploaded_by_id: string;
  uploaded_by_name: string;
  created_at: string;
}

function toNumber(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_loading_proofs_list_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_loading_proofs_list_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch loading proofs", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as ProofRow[];
  const normalized = rows.map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    proofType: row.proof_type,
    objectKey: row.object_key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: toNumber(row.file_size_bytes),
    uploadedById: row.uploaded_by_id,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ ok: true, data: normalized });
}
