import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await params;
  const { data, error } = await actorResult.supabase.rpc(
    "verification_get_vehicle_v1",
    { p_vehicle_id: vehicleId, p_actor_user_id: actorResult.actor.id } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_get_vehicle_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to load vehicle", error.code);
  }
  const payload = data as { success: boolean; data?: any } | null;
  return NextResponse.json({ ok: true, data: payload?.data });
}
