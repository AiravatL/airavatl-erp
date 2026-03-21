import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export const VERIFICATION_ALLOWED_ROLES: Role[] = [
  "super_admin",
  "admin",
  "sales_vehicles",
];

export const VERIFICATION_REVOKE_ROLES: Role[] = ["super_admin", "admin"];

export async function requireVerificationActor(allowedRoles?: readonly Role[]) {
  const actorResult = await requireServerActor(allowedRoles ?? VERIFICATION_ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult;
  return { supabase: actorResult.supabase, actor: actorResult.actor };
}

export function mapRpcError(message: string, code?: string) {
  if (message?.includes("forbidden"))
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (message?.includes("not_found"))
    return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  if (message?.includes("already_verified"))
    return NextResponse.json({ ok: false, message: "Partner is already verified" }, { status: 400 });
  if (message?.includes("invalid_user_type"))
    return NextResponse.json({ ok: false, message: "Invalid user type for this operation" }, { status: 400 });
  if (message?.includes("duplicate_registration"))
    return NextResponse.json({ ok: false, message: "A vehicle with this registration number already exists for a different owner" }, { status: 409 });
  if (code === "P0002")
    return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "42501")
    return NextResponse.json({ ok: false, message }, { status: 403 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
