import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

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

  const { data, error } = await actorResult.supabase
    .from("platform_settings" as never)
    .select("setting_key, setting_value, description, updated_at" as never)
    .eq("setting_key" as never, key)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message ?? "Unable to fetch setting" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, data: { key, value: {}, description: null, updated_at: null } });
  }

  const row = data as unknown as Record<string, unknown>;
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

  const { data, error } = await actorResult.supabase.rpc("admin_update_platform_setting_v1", {
    p_setting_key: key,
    p_setting_value: body.value,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: error.message ?? "Unable to update setting" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { key } });
}
