import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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
  const payload = data as { success: boolean; data?: unknown } | null;
  return NextResponse.json({ ok: true, data: (payload as { data?: unknown } | null)?.data });
}

// Admin-only: update mutable fields on a vehicle (currently vehicle_master_type_id).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const actorResult = await requireVerificationActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await params;
  if (!vehicleId) {
    return NextResponse.json({ ok: false, message: "vehicleId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { vehicleMasterTypeId?: unknown } | null;
  const masterTypeId =
    typeof body?.vehicleMasterTypeId === "string" ? body.vehicleMasterTypeId.trim() : null;
  if (!masterTypeId) {
    return NextResponse.json(
      { ok: false, message: "vehicleMasterTypeId is required" },
      { status: 400 },
    );
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "Service role client not configured" },
      { status: 500 },
    );
  }

  // Validate the master type exists & is active. The admin client is untyped
  // for the erp schema, so cast through unknown to call .schema().
  const erpClient = (adminClient as unknown as {
    schema: (name: string) => {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { id: string; active: boolean } | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
  }).schema("erp");

  const { data: master, error: masterErr } = await erpClient
    .from("vehicle_master_types")
    .select("id, active")
    .eq("id", masterTypeId)
    .maybeSingle();
  if (masterErr) {
    return NextResponse.json(
      { ok: false, message: masterErr.message ?? "Failed to validate vehicle type" },
      { status: 500 },
    );
  }
  if (!master) {
    return NextResponse.json({ ok: false, message: "Vehicle type not found" }, { status: 404 });
  }
  if (!master.active) {
    return NextResponse.json(
      { ok: false, message: "Selected vehicle type is inactive" },
      { status: 400 },
    );
  }

  const { data: existingRaw } = await adminClient
    .from("vehicles")
    .select("id, vehicle_master_type_id")
    .eq("id", vehicleId)
    .maybeSingle();
  const existing = existingRaw as { id: string; vehicle_master_type_id: string | null } | null;
  if (!existing) {
    return NextResponse.json({ ok: false, message: "Vehicle not found" }, { status: 404 });
  }

  const { error: updateErr } = await adminClient
    .from("vehicles")
    .update({ vehicle_master_type_id: masterTypeId, updated_at: new Date().toISOString() } as never)
    .eq("id", vehicleId);
  if (updateErr) {
    return NextResponse.json(
      { ok: false, message: updateErr.message ?? "Failed to update vehicle" },
      { status: 500 },
    );
  }

  try {
    await adminClient.rpc("audit_log_insert", {
      p_action: "vehicle_master_type_updated",
      p_entity_schema: "public",
      p_entity_table: "vehicles",
      p_entity_id: vehicleId,
      p_old_values: existing,
      p_new_values: { vehicle_master_type_id: masterTypeId },
    } as never);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, data: { vehicleId, vehicleMasterTypeId: masterTypeId } });
}
