import { NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import { ADMIN_ROLES, ROLE_VALUES } from "@/lib/auth/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";
const FULL_NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at?: string | null;
}

interface ActorProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
}

interface CreateUserBody {
  fullName?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  active?: unknown;
}

function isRole(value: string): value is Role {
  return ROLE_VALUES.includes(value as Role);
}

function isAdminRole(role: Role) {
  return ADMIN_ROLES.includes(role);
}

async function requireAdminActor() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("auth_get_my_profile_v1");
  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return {
        error: NextResponse.json({ ok: false, message: "Missing RPC: auth_get_my_profile_v1" }, { status: 500 }),
      };
    }
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const profile = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ActorProfileRow | null)
    : ((rpcData ?? null) as ActorProfileRow | null);

  if (!profile || !profile.active) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminRole(profile.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return {
    supabase,
    actor: {
      id: profile.id,
      role: profile.role,
    },
  };
}

function normalizeProfile(row: ProfileRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.created_at ?? null,
  };
}

export async function GET() {
  const actorResult = await requireAdminActor();
  if ("error" in actorResult) return actorResult.error;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("admin_list_users_v1");
  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_list_users_v1" }, { status: 500 });
    }

    return NextResponse.json(
      { ok: false, message: "Unable to fetch users", details: rpcError.message },
      { status: 500 },
    );
  }

  const rows = Array.isArray(rpcData)
    ? (rpcData as ProfileRow[])
    : rpcData
      ? ([rpcData] as ProfileRow[])
      : [];

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => normalizeProfile(row)),
  });
}

export async function POST(request: Request) {
  const actorResult = await requireAdminActor();
  if ("error" in actorResult) return actorResult.error;

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to create users from Admin.",
      },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as CreateUserBody | null;

  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = typeof body?.role === "string" ? body.role : "";
  const active = typeof body?.active === "boolean" ? body.active : true;

  if (!fullName || !email || !password || !role) {
    return NextResponse.json(
      { ok: false, message: "fullName, email, password, and role are required" },
      { status: 400 },
    );
  }

  if (!isRole(role)) {
    return NextResponse.json({ ok: false, message: "Invalid role" }, { status: 400 });
  }

  if (role === "super_admin") {
    return NextResponse.json(
      { ok: false, message: "Super Admin cannot be created from this screen" },
      { status: 403 },
    );
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (fullName.length > FULL_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `fullName must be at most ${FULL_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (email.length > EMAIL_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `email must be at most ${EMAIL_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ ok: false, message: "Invalid email address" }, { status: 400 });
  }

  const { data: createdAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createAuthError || !createdAuthUser.user) {
    return NextResponse.json(
      { ok: false, message: createAuthError?.message ?? "Unable to create auth user" },
      { status: 400 },
    );
  }

  const newUserId = createdAuthUser.user.id;

  const { data: rpcProfile, error: rpcProfileError } = await actorResult.supabase.rpc(
    "admin_upsert_profile_v1",
    {
      p_user_id: newUserId,
      p_full_name: fullName,
      p_email: email,
      p_role: role,
      p_active: active,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );

  if (rpcProfileError) {
    await adminClient.auth.admin.deleteUser(newUserId);
    if (isMissingRpcError(rpcProfileError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_upsert_profile_v1" }, { status: 500 });
    }

    return NextResponse.json(
      { ok: false, message: rpcProfileError.message ?? "Unable to create profile" },
      { status: 500 },
    );
  }

  const profile = Array.isArray(rpcProfile)
    ? ((rpcProfile[0] ?? null) as ProfileRow | null)
    : ((rpcProfile ?? null) as ProfileRow | null);

  if (!profile) {
    await adminClient.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      { ok: false, message: "Unable to create profile" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: normalizeProfile(profile),
    },
    { status: 201 },
  );
}
