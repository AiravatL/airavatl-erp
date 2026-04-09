import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  mapRpcError,
  requireVerificationActor,
  VERIFICATION_REVOKE_ROLES,
} from "@/app/api/verification/_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await params;
  const body = (await request.json().catch(() => null)) as {
    verificationNotes?: string;
  } | null;

  const { data, error } = await actorResult.supabase.rpc(
    "verification_verify_vehicle_v1",
    {
      p_vehicle_id: vehicleId,
      p_verification_notes: body?.verificationNotes ?? null,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_verify_vehicle_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to verify vehicle", error.code);
  }
  const payload = data as { success: boolean; data?: any } | null;
  return NextResponse.json({ ok: true, data: payload?.data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const actorResult = await requireVerificationActor(VERIFICATION_REVOKE_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;

  const { data, error } = await actorResult.supabase.rpc(
    "verification_revoke_vehicle_v1",
    {
      p_vehicle_id: vehicleId,
      p_reason: body?.reason ?? null,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_revoke_vehicle_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to revoke vehicle", error.code);
  }
  return NextResponse.json({ ok: true, data });
}
