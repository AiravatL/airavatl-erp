import { NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

const REPORT_ALLOWED_ROLES: Role[] = ["super_admin", "admin", "accounts"];

export interface ReportActor {
  id: string;
  role: Role;
}

export interface ReportFilters {
  fromDate: string | null;
  toDate: string | null;
  ownerId: string | null;
  vehicleType: string | null;
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseReportFilters(request: Request): { data?: ReportFilters; error?: NextResponse } {
  const { searchParams } = new URL(request.url);

  const fromDateRaw = searchParams.get("fromDate")?.trim() ?? "";
  const toDateRaw = searchParams.get("toDate")?.trim() ?? "";
  const ownerIdRaw = searchParams.get("ownerId")?.trim() ?? "";
  const vehicleTypeRaw = searchParams.get("vehicleType")?.trim() ?? "";

  if (fromDateRaw && !isValidIsoDate(fromDateRaw)) {
    return { error: NextResponse.json({ ok: false, message: "Invalid fromDate. Use YYYY-MM-DD." }, { status: 400 }) };
  }

  if (toDateRaw && !isValidIsoDate(toDateRaw)) {
    return { error: NextResponse.json({ ok: false, message: "Invalid toDate. Use YYYY-MM-DD." }, { status: 400 }) };
  }

  if (ownerIdRaw && !isUuid(ownerIdRaw)) {
    return { error: NextResponse.json({ ok: false, message: "Invalid ownerId." }, { status: 400 }) };
  }

  if (vehicleTypeRaw.length > 120) {
    return { error: NextResponse.json({ ok: false, message: "vehicleType is too long" }, { status: 400 }) };
  }

  return {
    data: {
      fromDate: fromDateRaw || null,
      toDate: toDateRaw || null,
      ownerId: ownerIdRaw || null,
      vehicleType: vehicleTypeRaw || null,
    },
  };
}

export function mapReportRpcError(message: string, code?: string) {
  if (message?.includes("permission_denied")) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }
  if (message?.includes("actor_not_found")) {
    return NextResponse.json({ ok: false, message: "User not found" }, { status: 401 });
  }
  if (message?.includes("actor_inactive")) {
    return NextResponse.json({ ok: false, message: "User account is inactive" }, { status: 403 });
  }
  if (message?.includes("invalid_date_range")) {
    return NextResponse.json({ ok: false, message: "fromDate must be earlier than or equal to toDate" }, { status: 400 });
  }
  if (code === "22P02") {
    return NextResponse.json({ ok: false, message: "Invalid input" }, { status: 400 });
  }
  return NextResponse.json({ ok: false, message: message || "Request failed" }, { status: 500 });
}

export async function requireReportActor() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const { data: role, error: rpcError } = await supabase.rpc("report_assert_actor_v1", {
    p_actor_user_id: user.id,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return { error: NextResponse.json({ ok: false, message: "Missing RPC: report_assert_actor_v1" }, { status: 500 }) };
    }
    return { error: mapReportRpcError(rpcError.message ?? "Unauthorized", rpcError.code) };
  }

  if (!role) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const actor = { id: user.id, role: role as Role } satisfies ReportActor;

  if (!REPORT_ALLOWED_ROLES.includes(actor.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, actor };
}
