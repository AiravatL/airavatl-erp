import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Last-known device permission state for a driver, written by the partner
// app on each foreground (debounced to once/hour). Best-effort triage data:
// if a driver isn't getting trips, ops can see which permission they denied
// instead of having to guess on a phone call.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "userId is required" },
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

  const { data, error } = await adminClient
    .from("driver_permission_state")
    .select(
      "user_id, state, checkpoint_version, app_version, platform, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message ?? "Unable to load permission state" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({
      ok: true,
      data: { hasState: false as const },
    });
  }

  const row = data as {
    user_id: string;
    state: Record<string, unknown> | null;
    checkpoint_version: number;
    app_version: string | null;
    platform: string | null;
    updated_at: string;
  };

  return NextResponse.json({
    ok: true,
    data: {
      hasState: true as const,
      state: (row.state ?? {}) as DriverPermissionStateValues,
      checkpointVersion: row.checkpoint_version,
      appVersion: row.app_version,
      platform: row.platform,
      updatedAt: row.updated_at,
    },
  });
}

// Local type to keep the route self-documenting; mirrored in the client lib.
type Tri = "granted" | "denied" | "undetermined";
type Overlay = Tri | "not_applicable";
interface DriverPermissionStateValues {
  location_foreground?: Tri;
  location_background?: Tri;
  notifications?: Tri;
  overlay?: Overlay;
  battery_optimization_ignored?: boolean | null;
}
