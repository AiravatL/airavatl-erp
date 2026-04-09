import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  mapRpcError,
  requireVerificationActor,
  VERIFICATION_REVOKE_ROLES,
} from "@/app/api/verification/_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { driverId } = await params;
  const body = (await request.json().catch(() => null)) as {
    verificationNotes?: string;
  } | null;

  const { data, error } = await actorResult.supabase.rpc(
    "verification_verify_employee_driver_v1",
    {
      p_employee_driver_id: driverId,
      p_verification_notes: body?.verificationNotes ?? null,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_verify_employee_driver_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to verify driver", error.code);
  }
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const actorResult = await requireVerificationActor(VERIFICATION_REVOKE_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { driverId } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;

  const { data, error } = await actorResult.supabase.rpc(
    "verification_revoke_employee_driver_v1",
    {
      p_employee_driver_id: driverId,
      p_reason: body?.reason ?? null,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_revoke_employee_driver_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to revoke driver", error.code);
  }
  return NextResponse.json({ ok: true, data });
}
