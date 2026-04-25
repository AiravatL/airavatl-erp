import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapCustomerRpcError, requireCustomerActor } from "@/app/api/customers/_shared";

export const dynamic = "force-dynamic";

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const FULL_NAME_MAX_LENGTH = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ["viewer", "manager"] as const;

interface PortalUserRow {
  id: string;
  customer_id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  role: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

interface CreateBody {
  fullName?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  active?: unknown;
}

interface RouteParams {
  params: Promise<{ customerId: string }>;
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

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireCustomerActor("read");
  if ("error" in actorResult) return actorResult.error;

  const { customerId } = await context.params;
  if (!customerId) {
    return NextResponse.json({ ok: false, message: "customerId is required" }, { status: 400 });
  }

  const { data, error } = await actorResult.supabase.rpc("admin_list_customer_portal_users_v1", {
    p_customer_id: customerId,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_list_customer_portal_users_v1" },
        { status: 500 },
      );
    }
    return mapCustomerRpcError(error.message ?? "Unable to fetch portal users", error.code);
  }

  const rows = (Array.isArray(data) ? data : data ? [data] : []) as PortalUserRow[];
  return NextResponse.json({ ok: true, data: rows.map(normalize) });
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireCustomerActor("write");
  if ("error" in actorResult) return actorResult.error;

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY is not configured." },
      { status: 500 },
    );
  }

  const { customerId } = await context.params;
  if (!customerId) {
    return NextResponse.json({ ok: false, message: "customerId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = typeof body?.role === "string" ? body.role : "viewer";
  const active = typeof body?.active === "boolean" ? body.active : true;

  if (!fullName || !email || !password) {
    return NextResponse.json(
      { ok: false, message: "fullName, email, and password are required" },
      { status: 400 },
    );
  }
  if (fullName.length > FULL_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `fullName must be at most ${FULL_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, message: "Invalid email address" }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        message: `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
      },
      { status: 400 },
    );
  }
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ ok: false, message: "Invalid role" }, { status: 400 });
  }

  const { data: createdAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, customer_portal: true, customer_id: customerId },
  });

  if (createAuthError || !createdAuthUser.user) {
    const msg = createAuthError?.message ?? "Unable to create auth user";
    const status = /already registered|already exists/i.test(msg) ? 409 : 400;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }

  const newAuthUserId = createdAuthUser.user.id;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_create_customer_portal_user_v1",
    {
      p_customer_id: customerId,
      p_auth_user_id: newAuthUserId,
      p_email: email,
      p_full_name: fullName,
      p_role: role,
      p_active: active,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );

  if (rpcError) {
    await adminClient.auth.admin.deleteUser(newAuthUserId);
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_create_customer_portal_user_v1" },
        { status: 500 },
      );
    }
    return mapCustomerRpcError(rpcError.message ?? "Unable to create portal user", rpcError.code);
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as PortalUserRow | null;
  if (!row) {
    await adminClient.auth.admin.deleteUser(newAuthUserId);
    return NextResponse.json(
      { ok: false, message: "Unable to create portal user" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: normalize(row) }, { status: 201 });
}
