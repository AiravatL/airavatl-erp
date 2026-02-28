import { NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import { ADMIN_ROLES, ROLE_VALUES } from "@/lib/auth/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcError } from "@/lib/supabase/rpc";

const FULL_NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

interface RouteParams {
  params: Promise<{ userId: string }>;
}

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

interface PatchBody {
  fullName?: unknown;
  role?: unknown;
  active?: unknown;
  password?: unknown;
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

async function listUsers(actorSupabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: rpcData, error: rpcError } = await actorSupabase.rpc("admin_list_users_v1");

  if (rpcError) {
    return { error: rpcError };
  }

  const rows = Array.isArray(rpcData)
    ? (rpcData as ProfileRow[])
    : rpcData
      ? ([rpcData] as ProfileRow[])
      : [];

  return { data: rows };
}

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireAdminActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "Missing userId" }, { status: 400 });
  }

  const usersResult = await listUsers(actorResult.supabase);
  if ("error" in usersResult) {
    if (isMissingRpcError(usersResult.error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_list_users_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: "Unable to fetch users" }, { status: 500 });
  }

  const row = usersResult.data.find((user) => user.id === userId);
  if (!row) {
    return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: normalizeProfile(row) });
}

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireAdminActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "Missing userId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const hasFullName = !!body && Object.prototype.hasOwnProperty.call(body, "fullName");
  const hasRole = !!body && Object.prototype.hasOwnProperty.call(body, "role");
  const hasActive = typeof body?.active === "boolean";
  const hasPassword = !!body && Object.prototype.hasOwnProperty.call(body, "password");

  if (!hasFullName && !hasRole && !hasActive && !hasPassword) {
    return NextResponse.json(
      { ok: false, message: "At least one field is required: fullName, role, active, password" },
      { status: 400 },
    );
  }

  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  if (hasFullName && !fullName) {
    return NextResponse.json({ ok: false, message: "fullName cannot be empty" }, { status: 400 });
  }
  if (hasFullName && fullName.length > FULL_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `fullName must be at most ${FULL_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const role = typeof body?.role === "string" ? body.role : "";
  if (hasRole && !isRole(role)) {
    return NextResponse.json({ ok: false, message: "Invalid role" }, { status: 400 });
  }

  const password = typeof body?.password === "string" ? body.password : "";
  if (hasPassword && password.trim().length > 0 && password.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (hasPassword && password.trim().length > 0 && password.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  if (hasRole && role === "super_admin") {
    return NextResponse.json(
      { ok: false, message: "Super Admin role cannot be assigned from this screen" },
      { status: 403 },
    );
  }

  if (userId === actorResult.actor.id && hasActive && body.active === false) {
    return NextResponse.json(
      { ok: false, message: "You cannot deactivate your own account" },
      { status: 400 },
    );
  }

  const usersResult = await listUsers(actorResult.supabase);
  if ("error" in usersResult) {
    if (isMissingRpcError(usersResult.error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_list_users_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: "Unable to fetch users" }, { status: 500 });
  }

  const existing = usersResult.data.find((user) => user.id === userId);
  if (!existing) {
    return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
  }

  if (existing.role === "super_admin") {
    return NextResponse.json(
      { ok: false, message: "Super Admin status cannot be changed from this screen" },
      { status: 403 },
    );
  }

  if (hasPassword && password.trim().length > 0) {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to update user passwords from Admin.",
        },
        { status: 500 },
      );
    }

    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
      password,
    });
    if (authUpdateError) {
      return NextResponse.json(
        { ok: false, message: authUpdateError.message || "Unable to update password" },
        { status: 400 },
      );
    }
  }

  const nextFullName = hasFullName ? fullName : existing.full_name;
  const nextRole = hasRole ? (role as Role) : existing.role;
  const nextActive = hasActive ? !!body?.active : existing.active;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("admin_upsert_profile_v1", {
    p_user_id: userId,
    p_full_name: nextFullName,
    p_email: existing.email,
    p_role: nextRole,
    p_active: nextActive,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_upsert_profile_v1" }, { status: 500 });
    }
    return NextResponse.json(
      { ok: false, message: rpcError.message || "Unable to update user" },
      { status: 500 },
    );
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ProfileRow | null)
    : ((rpcData ?? null) as ProfileRow | null);

  if (!row) {
    return NextResponse.json(
      { ok: false, message: "Unable to update user" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: normalizeProfile(row) });
}

export async function DELETE(_: Request, context: RouteParams) {
  const actorResult = await requireAdminActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "Missing userId" }, { status: 400 });
  }

  if (userId === actorResult.actor.id) {
    return NextResponse.json(
      { ok: false, message: "You cannot remove your own account" },
      { status: 400 },
    );
  }

  const usersResult = await listUsers(actorResult.supabase);
  if ("error" in usersResult) {
    if (isMissingRpcError(usersResult.error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_list_users_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: "Unable to fetch users" }, { status: 500 });
  }

  const existing = usersResult.data.find((user) => user.id === userId);
  if (!existing) {
    return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
  }

  if (existing.role === "super_admin") {
    return NextResponse.json(
      { ok: false, message: "Super Admin cannot be removed from this screen" },
      { status: 403 },
    );
  }

  const { error: rpcError } = await actorResult.supabase.rpc("admin_upsert_profile_v1", {
    p_user_id: userId,
    p_full_name: existing.full_name,
    p_email: existing.email,
    p_role: existing.role,
    p_active: false,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_upsert_profile_v1" }, { status: 500 });
    }
    return NextResponse.json(
      { ok: false, message: rpcError.message || "Unable to remove user" },
      { status: 500 },
    );
  }

  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    await adminClient.auth.admin.deleteUser(userId, true);
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: userId,
      removed: true,
      mode: "deactivated",
    },
  });
}
