import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ProfileInput {
  fullName?: string;
  city?: string | null;
  state?: string | null;
}

function validate(body: unknown): { ok: true; data: ProfileInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid body" };
  const b = body as Record<string, unknown>;

  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : undefined;
  const city = typeof b.city === "string" ? b.city.trim() : b.city === null ? null : undefined;
  const state = typeof b.state === "string" ? b.state.trim() : b.state === null ? null : undefined;

  if (fullName !== undefined && (fullName.length < 1 || fullName.length > 100)) {
    return { ok: false, message: "fullName: required (1-100 chars)" };
  }
  if (city !== undefined && city !== null && city.length > 100) {
    return { ok: false, message: "city: max 100 chars" };
  }
  if (state !== undefined && state !== null && state.length > 100) {
    return { ok: false, message: "state: max 100 chars" };
  }

  if (fullName === undefined && city === undefined && state === undefined) {
    return { ok: false, message: "At least one field is required: fullName, city, state" };
  }

  return { ok: true, data: { fullName, city, state } };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  // Only super_admin and admin can edit partner profile info.
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

  const updates: Record<string, unknown> = {};
  if (input.fullName !== undefined) updates.full_name = input.fullName;
  if (input.city !== undefined) updates.city = input.city;
  if (input.state !== undefined) updates.state = input.state;
  updates.updated_at = new Date().toISOString();

  const { data: existing } = await adminClient
    .from("user_profiles")
    .select("id, full_name, city, state")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ ok: false, message: "Partner not found" }, { status: 404 });
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

  // Best-effort audit log
  try {
    await adminClient.rpc("audit_log_insert", {
      p_action: "partner_profile_updated",
      p_entity_schema: "public",
      p_entity_table: "user_profiles",
      p_entity_id: userId,
      p_old_values: existing,
      p_new_values: updates,
    } as never);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, data: { userId } });
}
