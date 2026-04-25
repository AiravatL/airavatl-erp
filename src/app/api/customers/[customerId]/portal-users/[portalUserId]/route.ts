import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapCustomerRpcError, requireCustomerActor } from "@/app/api/customers/_shared";

export const dynamic = "force-dynamic";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const FULL_NAME_MAX_LENGTH = 100;
const ALLOWED_ROLES = ["viewer", "manager"] as const;

interface PortalUserRow {
  id: string;
  customer_id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

interface PatchBody {
  fullName?: unknown;
  role?: unknown;
  active?: unknown;
  password?: unknown;
}

interface RouteParams {
  params: Promise<{ customerId: string; portalUserId: string }>;
}

function normalize(row: PortalUserRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    authUserId: row.auth_user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireCustomerActor("write");
  if ("error" in actorResult) return actorResult.error;

  const { portalUserId } = await context.params;
  if (!portalUserId) {
    return NextResponse.json({ ok: false, message: "portalUserId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ ok: false, message: "Body required" }, { status: 400 });

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : null;
  const role = typeof body.role === "string" ? body.role : null;
  const active = typeof body.active === "boolean" ? body.active : null;
  const password = typeof body.password === "string" ? body.password : null;

  if (fullName !== null && (fullName.length === 0 || fullName.length > FULL_NAME_MAX_LENGTH)) {
    return NextResponse.json({ ok: false, message: "Invalid fullName" }, { status: 400 });
  }
  if (role !== null && !ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ ok: false, message: "Invalid role" }, { status: 400 });
  }
  if (
    password !== null &&
    (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_update_customer_portal_user_v1",
    {
      p_id: portalUserId,
      p_full_name: fullName,
      p_role: role,
      p_active: active,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_update_customer_portal_user_v1" },
        { status: 500 },
      );
    }
    return mapCustomerRpcError(rpcError.message ?? "Update failed", rpcError.code);
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as PortalUserRow | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Portal user not found" }, { status: 404 });
  }

  if (password) {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY is not configured." },
        { status: 500 },
      );
    }
    const { error: updErr } = await adminClient.auth.admin.updateUserById(row.auth_user_id, {
      password,
    });
    if (updErr) {
      return NextResponse.json(
        { ok: false, message: updErr.message ?? "Failed to update password" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true, data: normalize(row) });
}

export async function DELETE(_: Request, context: RouteParams) {
  const actorResult = await requireCustomerActor("write");
  if ("error" in actorResult) return actorResult.error;

  const { portalUserId } = await context.params;
  if (!portalUserId) {
    return NextResponse.json({ ok: false, message: "portalUserId is required" }, { status: 400 });
  }

  // Look up the auth user id BEFORE deleting the portal row so we can drop the auth user too.
  const { data: existingRows, error: lookupError } = await actorResult.supabase
    .schema("erp")
    .from("customer_portal_users")
    .select("auth_user_id")
    .eq("id", portalUserId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { ok: false, message: lookupError.message ?? "Lookup failed" },
      { status: 500 },
    );
  }
  if (!existingRows) {
    return NextResponse.json({ ok: false, message: "Portal user not found" }, { status: 404 });
  }

  const authUserId = existingRows.auth_user_id as string;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_delete_customer_portal_user_v1",
    {
      p_id: portalUserId,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_delete_customer_portal_user_v1" },
        { status: 500 },
      );
    }
    return mapCustomerRpcError(rpcError.message ?? "Delete failed", rpcError.code);
  }

  if (rpcData === false) {
    return NextResponse.json({ ok: false, message: "Portal user not found" }, { status: 404 });
  }

  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    await adminClient.auth.admin.deleteUser(authUserId);
  }

  return NextResponse.json({ ok: true, data: { id: portalUserId, removed: true } });
}
