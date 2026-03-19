import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["super_admin", "admin"] as const;

interface PlatformSettingRow {
  id: string;
  setting_key: string;
  setting_value: { value: number; min: number; max: number };
  description: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export async function GET() {
  const actorResult = await requireServerActor(ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { data, error } = await actorResult.supabase
    .from("platform_settings" as never)
    .select("*" as never)
    .in("setting_key" as never, [
      "commission_percentage",
      "gst_percentage",
      "advance_percentage",
    ]);

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message ?? "Unable to load platform settings" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as PlatformSettingRow[];
  const settings: Record<string, { value: number; min: number; max: number; description: string | null }> = {};
  for (const row of rows) {
    settings[row.setting_key] = {
      value: row.setting_value.value,
      min: row.setting_value.min,
      max: row.setting_value.max,
      description: row.description,
    };
  }

  return NextResponse.json({ ok: true, data: settings });
}

interface UpdateBody {
  settings?: Array<{
    key?: unknown;
    value?: unknown;
  }>;
}

const VALID_KEYS = new Set([
  "commission_percentage",
  "gst_percentage",
  "advance_percentage",
]);

export async function PUT(request: Request) {
  const actorResult = await requireServerActor(ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body?.settings || !Array.isArray(body.settings)) {
    return NextResponse.json(
      { ok: false, message: "settings array is required" },
      { status: 400 },
    );
  }

  for (const item of body.settings) {
    const key = typeof item.key === "string" ? item.key : "";
    const value = typeof item.value === "number" ? item.value : null;

    if (!VALID_KEYS.has(key)) {
      return NextResponse.json(
        { ok: false, message: `Invalid setting key: ${key}` },
        { status: 400 },
      );
    }
    if (value === null || !Number.isFinite(value) || value < 0) {
      return NextResponse.json(
        { ok: false, message: `Invalid value for ${key}` },
        { status: 400 },
      );
    }
  }

  // Read current values to preserve min/max
  const { data: currentData, error: readError } = await actorResult.supabase
    .from("platform_settings" as never)
    .select("setting_key, setting_value" as never)
    .in("setting_key" as never, body.settings.map((s) => s.key));

  if (readError) {
    return NextResponse.json(
      { ok: false, message: readError.message ?? "Unable to read current settings" },
      { status: 500 },
    );
  }

  const currentMap = new Map<string, { min: number; max: number }>();
  for (const row of (currentData ?? []) as unknown as PlatformSettingRow[]) {
    currentMap.set(row.setting_key, {
      min: row.setting_value.min,
      max: row.setting_value.max,
    });
  }

  // Validate values against min/max
  for (const item of body.settings) {
    const key = item.key as string;
    const value = item.value as number;
    const bounds = currentMap.get(key);
    if (bounds && (value < bounds.min || value > bounds.max)) {
      return NextResponse.json(
        { ok: false, message: `${key} must be between ${bounds.min} and ${bounds.max}` },
        { status: 400 },
      );
    }
  }

  // Update each setting via RPC
  for (const item of body.settings) {
    const key = item.key as string;
    const value = item.value as number;
    const bounds = currentMap.get(key) ?? { min: 0, max: 100 };

    const { error: rpcError } = await actorResult.supabase.rpc(
      "admin_update_platform_setting_v1",
      {
        p_setting_key: key,
        p_setting_value: { value, min: bounds.min, max: bounds.max },
      } as never,
    );

    if (rpcError) {
      if (isMissingRpcError(rpcError)) {
        return NextResponse.json(
          { ok: false, message: "Missing RPC: admin_update_platform_setting_v1" },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { ok: false, message: rpcError.message ?? `Unable to update ${key}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, data: { updated: body.settings.length } });
}
