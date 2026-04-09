import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { driverId } = await params;
  const { data, error } = await actorResult.supabase.rpc(
    "verification_get_employee_driver_v1",
    { p_employee_driver_id: driverId, p_actor_user_id: actorResult.actor.id } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_get_employee_driver_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to load driver", error.code);
  }
  const payload = data as { success: boolean; data?: any } | null;
  return NextResponse.json({ ok: true, data: payload?.data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { driverId } = await params;
  const body = (await request.json().catch(() => null)) as {
    licenseNumber?: string;
    licenseExpiryDate?: string;
    aadharNumber?: string;
    employeeId?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  } | null;

  const { data, error } = await actorResult.supabase.rpc(
    "verification_update_employee_driver_v1",
    {
      p_employee_driver_id: driverId,
      p_license_number: body?.licenseNumber ?? null,
      p_license_expiry_date: body?.licenseExpiryDate ?? null,
      p_aadhar_number: body?.aadharNumber ?? null,
      p_employee_id: body?.employeeId ?? null,
      p_emergency_contact_name: body?.emergencyContactName ?? null,
      p_emergency_contact_phone: body?.emergencyContactPhone ?? null,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_update_employee_driver_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to update driver", error.code);
  }
  return NextResponse.json({ ok: true, data });
}
