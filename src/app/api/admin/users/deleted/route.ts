import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface DeletedAdminRow {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  active: boolean;
  created_at: string | null;
  deleted_at: string | null;
}

export async function GET() {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { data, error } = await actorResult.supabase.rpc(
    "admin_list_deleted_users_v1",
    { p_actor_user_id: actorResult.actor.id } as never,
  );

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_list_deleted_users_v1" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, message: error.message ?? "Unable to load deleted users" },
      { status: 500 },
    );
  }

  const rows = (Array.isArray(data) ? data : []) as DeletedAdminRow[];
  return NextResponse.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      fullName: row.full_name ?? "",
      email: row.email,
      role: row.role,
      active: !!row.active,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
    })),
  });
}
