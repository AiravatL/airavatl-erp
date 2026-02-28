import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import type { Role } from "@/lib/types";

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface CustomerActor {
  id: string;
  role: Role;
  active: boolean;
}

export const CUSTOMER_READ_ROLES: Role[] = [
  "super_admin",
  "admin",
  "operations_consigner",
  "operations_vehicles",
  "sales_vehicles",
  "sales_consigner",
  "accounts",
  "support",
];

export const CUSTOMER_WRITE_ROLES: Role[] = ["super_admin", "admin"];

export async function requireCustomerActor(mode: "read" | "write" = "read") {
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

  const allowed = mode === "write" ? CUSTOMER_WRITE_ROLES : CUSTOMER_READ_ROLES;
  if (!allowed.includes(profile.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return {
    supabase,
    actor: {
      id: profile.id,
      role: profile.role,
      active: profile.active,
    } satisfies CustomerActor,
  };
}

export function mapCustomerRpcError(message: string, code?: string) {
  if (message?.includes("forbidden")) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }
  if (message?.includes("not_found")) {
    return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  }
  if (message?.includes("invalid_status") || message?.includes("invalid_credit_health")) {
    return NextResponse.json({ ok: false, message: "Invalid filters" }, { status: 400 });
  }
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  if (code === "22023") return NextResponse.json({ ok: false, message }, { status: 400 });
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
