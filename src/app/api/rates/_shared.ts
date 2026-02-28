import { NextResponse } from "next/server";
import type { MarketRate, RateComment, Role } from "@/lib/types";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

export const RATE_CREATOR_ROLES: Role[] = [
  "sales_vehicles",
  "operations_vehicles",
  ...ADMIN_ROLES,
];

export const RATE_REVIEWER_ROLES: Role[] = ["operations_vehicles", ...ADMIN_ROLES];
export const RATE_REVIEW_VIEW_ROLES: Role[] = ["sales_vehicles", ...RATE_REVIEWER_ROLES];
export const RATE_AUTO_APPROVE_ROLES: Role[] = ["operations_vehicles", ...ADMIN_ROLES];

interface ProfileRow {
  id: string;
  role: Role;
  active: boolean;
  full_name?: string | null;
}

export interface RateRow {
  id: string;
  from_location: string;
  to_location: string;
  vehicle_type: string;
  rate_category: MarketRate["rateCategory"];
  freight_rate: number | string;
  rate_per_ton: number | string | null;
  rate_per_kg: number | string | null;
  confidence_level: MarketRate["confidenceLevel"];
  source: string | null;
  remarks: string | null;
  submitted_by_id: string;
  submitted_by_name?: string | null;
  reviewed_by_id: string | null;
  reviewed_by_name?: string | null;
  status: MarketRate["status"];
  created_at: string;
  reviewed_at: string | null;
  updated_at?: string | null;
}

export interface RateCommentRow {
  id: string;
  rate_id: string;
  comment_text: string;
  created_by_id: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

function toNumber(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toNullableNumber(value: number | string | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function normalizeRateRow(row: RateRow): MarketRate {
  return {
    id: row.id,
    fromLocation: row.from_location,
    toLocation: row.to_location,
    vehicleType: row.vehicle_type,
    rateCategory: row.rate_category,
    freightRate: toNumber(row.freight_rate),
    ratePerTon: toNullableNumber(row.rate_per_ton),
    ratePerKg: toNullableNumber(row.rate_per_kg),
    confidenceLevel: row.confidence_level,
    source: row.source,
    remarks: row.remarks,
    submittedBy: row.submitted_by_id,
    submittedByName: row.submitted_by_name ?? "Unknown",
    reviewedBy: row.reviewed_by_id,
    reviewedByName: row.reviewed_by_name ?? null,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export function normalizeRateCommentRow(row: RateCommentRow): RateComment {
  return {
    id: row.id,
    rateId: row.rate_id,
    commentText: row.comment_text,
    createdById: row.created_by_id,
    createdByName: row.created_by_name ?? "Unknown",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

export function isRateAutoApproveRole(role: Role): boolean {
  return RATE_AUTO_APPROVE_ROLES.includes(role);
}

export async function requireRateActor(allowedRoles?: Role[]) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profileData, error: profileError } = await supabase.rpc("auth_get_my_profile_v1");
  if (profileError) {
    if (isMissingRpcError(profileError)) {
      return {
        error: NextResponse.json(
          { ok: false, message: "Missing RPC: auth_get_my_profile_v1" },
          { status: 500 },
        ),
      };
    }

    return {
      error: NextResponse.json(
        { ok: false, message: profileError.message ?? "Unauthorized" },
        { status: profileError.code === "42501" ? 401 : 500 },
      ),
    };
  }

  const profile = Array.isArray(profileData)
    ? ((profileData[0] ?? null) as ProfileRow | null)
    : ((profileData ?? null) as ProfileRow | null);

  if (!profile || !profile.active) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const actor = profile as ProfileRow;
  if (allowedRoles && !allowedRoles.includes(actor.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, actor };
}
