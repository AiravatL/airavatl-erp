import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DeleteRpcResult {
  success: boolean;
  error?: string;
  blockers?: string[];
}

/**
 * Permanently delete an app user account (consigner / driver / transporter).
 * Intended for wrong-app signups — the RPC refuses accounts with any
 * business activity (trips, bids, requests, vehicles, employee drivers).
 */
export async function DELETE(request: Request, context: RouteParams) {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await context.params;
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ ok: false, message: "Invalid user id" }, { status: 400 });
  }

  let reason: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body.reason === "string") reason = body.reason.slice(0, 500);
  } catch {
    // No body is fine.
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_delete_app_user_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_user_id: userId,
      p_reason: reason,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_delete_app_user_v1" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to delete user" },
      { status: 500 },
    );
  }

  const result = (rpcData ?? null) as DeleteRpcResult | null;
  if (!result?.success) {
    const code = result?.error ?? "delete_failed";
    if (code === "user_not_found") {
      return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
    }
    if (code === "not_an_app_user") {
      return NextResponse.json(
        { ok: false, message: "This account is not an app user" },
        { status: 400 },
      );
    }
    if (code === "user_has_activity") {
      const blockers = Array.isArray(result?.blockers) ? result.blockers : [];
      return NextResponse.json(
        {
          ok: false,
          message: `Cannot delete: account has ${blockers.join(", ") || "activity"}. Only accounts without any activity can be removed.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, message: "Unable to delete user" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { deleted: true } });
}
