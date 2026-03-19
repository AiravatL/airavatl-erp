import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAPS_ALLOWED_ROLES: Role[] = [
  "super_admin",
  "admin",
  "sales_consigner",
];

export async function requireMapsActor() {
  const actorResult = await requireServerActor(MAPS_ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult;
  return { supabase: actorResult.supabase, actor: actorResult.actor };
}

export function getGoogleMapsApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY ?? null;
}

export function missingKeyResponse() {
  return NextResponse.json(
    { ok: false, message: "Google Maps API key is not configured" },
    { status: 500 },
  );
}
