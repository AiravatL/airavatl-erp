import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DRIVER_USER_TYPES = ["individual_driver", "transporter", "employee_driver"] as const;
type DriverUserType = (typeof DRIVER_USER_TYPES)[number];

interface ProfileInput {
  fullName?: string;
  city?: string | null;
  state?: string | null;
  userType?: DriverUserType;
}

function validate(body: unknown): { ok: true; data: ProfileInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid body" };
  const b = body as Record<string, unknown>;

  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : undefined;
  const city = typeof b.city === "string" ? b.city.trim() : b.city === null ? null : undefined;
  const state = typeof b.state === "string" ? b.state.trim() : b.state === null ? null : undefined;
  const userType =
    typeof b.userType === "string" && (DRIVER_USER_TYPES as readonly string[]).includes(b.userType)
      ? (b.userType as DriverUserType)
      : undefined;

  if (fullName !== undefined && (fullName.length < 1 || fullName.length > 100)) {
    return { ok: false, message: "fullName: required (1-100 chars)" };
  }
  if (city !== undefined && city !== null && city.length > 100) {
    return { ok: false, message: "city: max 100 chars" };
  }
  if (state !== undefined && state !== null && state.length > 100) {
    return { ok: false, message: "state: max 100 chars" };
  }
  if (b.userType !== undefined && userType === undefined) {
    return {
      ok: false,
      message: "userType must be one of: individual_driver, transporter, employee_driver",
    };
  }

  if (fullName === undefined && city === undefined && state === undefined && userType === undefined) {
    return { ok: false, message: "At least one field is required: fullName, city, state, userType" };
  }

  return { ok: true, data: { fullName, city, state, userType } };
}

const TYPE_TABLE: Record<DriverUserType, "individual_drivers" | "transporters" | "employee_drivers"> = {
  individual_driver: "individual_drivers",
  transporter: "transporters",
  employee_driver: "employee_drivers",
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validate(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
  }
  const input = parsed.data;

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "Service role client not configured" },
      { status: 500 },
    );
  }

  const { data: existingRaw } = await adminClient
    .from("user_profiles")
    .select("id, full_name, city, state, user_type, is_verified")
    .eq("id", userId)
    .maybeSingle();

  const existing = existingRaw as
    | { id: string; full_name: string; city: string | null; state: string | null; user_type: string; is_verified: boolean }
    | null;

  if (!existing) {
    return NextResponse.json({ ok: false, message: "Partner not found" }, { status: 404 });
  }

  // Guard role swaps: only allowed before verification, and not for consigners.
  const swappingType = input.userType !== undefined && input.userType !== existing.user_type;
  if (swappingType) {
    if (existing.is_verified) {
      return NextResponse.json(
        { ok: false, message: "Cannot change role after verification. Revoke first." },
        { status: 400 },
      );
    }
    if (existing.user_type === "consigner") {
      return NextResponse.json(
        { ok: false, message: "Consigner accounts cannot be converted from this page." },
        { status: 400 },
      );
    }
    // Refuse if the user has any auction/trip activity tied to the current role.
    const [bids, trips, payments] = await Promise.all([
      adminClient.from("auction_bids").select("id", { count: "exact", head: true }).eq("bidder_id", userId),
      adminClient.from("trips").select("id", { count: "exact", head: true }).or(`driver_id.eq.${userId},assigned_driver_id.eq.${userId}`),
      adminClient.from("trip_driver_payments").select("id", { count: "exact", head: true }).eq("driver_user_id", userId),
    ]);
    const blocking =
      (bids.count ?? 0) > 0 ||
      (trips.count ?? 0) > 0 ||
      (payments.count ?? 0) > 0;
    if (blocking) {
      return NextResponse.json(
        { ok: false, message: "Cannot change role: partner has bids, trips, or payments on record." },
        { status: 400 },
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.fullName !== undefined) updates.full_name = input.fullName;
  if (input.city !== undefined) updates.city = input.city;
  if (input.state !== undefined) updates.state = input.state;
  if (swappingType) updates.user_type = input.userType;
  updates.updated_at = new Date().toISOString();

  if (swappingType) {
    const oldType = existing.user_type as DriverUserType | "consigner";
    const newType = input.userType as DriverUserType;

    // 1) Drop the old type-specific row (if any).
    if (oldType in TYPE_TABLE) {
      const oldTable = TYPE_TABLE[oldType as DriverUserType];
      const { error: delErr } = await adminClient
        .from(oldTable)
        .delete()
        .eq("user_id", userId);
      if (delErr) {
        return NextResponse.json(
          { ok: false, message: `Failed to clear old role row (${oldTable}): ${delErr.message}` },
          { status: 500 },
        );
      }

      // Also drop the old DPS row for that driver_type so a future
      // verification can land cleanly. DPS uniqueness is on
      // (user_id, driver_type) — leaving stale rows breaks the .single()
      // lookup in the onboarding edge function.
      const { error: dpsDelErr } = await adminClient
        .from("driver_payout_settings")
        .delete()
        .eq("user_id", userId)
        .eq("driver_type", oldType);
      if (dpsDelErr) {
        return NextResponse.json(
          { ok: false, message: `Failed to clear old payout settings: ${dpsDelErr.message}` },
          { status: 500 },
        );
      }
    }

    // 2) Insert a stub for the new type so onboarding/verification has somewhere to land.
    const newTable = TYPE_TABLE[newType];
    const insertPayload =
      newType === "transporter"
        ? { user_id: userId, organization_name: `${existing.full_name}'s Transport` }
        : { user_id: userId };
    const { error: insErr } = await adminClient
      .from(newTable)
      .insert(insertPayload as never);
    if (insErr && !insErr.message?.includes("duplicate key")) {
      return NextResponse.json(
        { ok: false, message: `Failed to create new role row (${newTable}): ${insErr.message}` },
        { status: 500 },
      );
    }
  }

  const { error: updateError } = await adminClient
    .from("user_profiles")
    .update(updates as never)
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json(
      { ok: false, message: updateError.message ?? "Failed to update profile" },
      { status: 500 },
    );
  }

  try {
    await adminClient.rpc("audit_log_insert", {
      p_action: swappingType ? "partner_role_changed" : "partner_profile_updated",
      p_entity_schema: "public",
      p_entity_table: "user_profiles",
      p_entity_id: userId,
      p_old_values: existing,
      p_new_values: updates,
    } as never);
  } catch {
    // ignore
  }

  return NextResponse.json({
    ok: true,
    data: { userId, userType: swappingType ? input.userType : existing.user_type },
  });
}
