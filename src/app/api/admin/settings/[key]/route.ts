import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SETTINGS_ALLOWED_ROLES = ["super_admin", "admin"] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const actorResult = await requireServerActor(SETTINGS_ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { key } = await params;
  if (!key) {
    return NextResponse.json({ ok: false, message: "Setting key is required" }, { status: 400 });
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ ok: false, message: "Admin client not configured" }, { status: 500 });
  }

  const { data, error } = await adminClient
    .schema("erp" as never)
    .from("policy_settings" as never)
    .select("setting_key, setting_value, description, updated_at")
    .eq("setting_key" as never, key)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message ?? "Unable to fetch setting" }, { status: 500 });
  }

  if (!data) {
    // Return empty default if setting doesn't exist yet
    return NextResponse.json({ ok: true, data: { key, value: {}, description: null, updated_at: null } });
  }

  const row = data as Record<string, unknown>;
  return NextResponse.json({ ok: true, data: {
    key: row.setting_key,
    value: row.setting_value,
    description: row.description,
    updated_at: row.updated_at,
  } });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const actorResult = await requireServerActor(SETTINGS_ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { key } = await params;
  if (!key) {
    return NextResponse.json({ ok: false, message: "Setting key is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { value?: Record<string, unknown> } | null;
  if (!body?.value || typeof body.value !== "object") {
    return NextResponse.json({ ok: false, message: "Value object is required" }, { status: 400 });
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ ok: false, message: "Admin client not configured" }, { status: 500 });
  }

  const { error } = await adminClient
    .schema("erp" as never)
    .from("policy_settings" as never)
    .upsert({
      setting_key: key,
      setting_value: body.value,
      updated_by: actorResult.actor.id,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "setting_key" } as never);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message ?? "Unable to update setting" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { key } });
}
