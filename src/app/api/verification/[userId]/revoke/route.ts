import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  mapRpcError,
  requireVerificationActor,
  VERIFICATION_REVOKE_ROLES,
} from "@/app/api/verification/_shared";

interface RevokeBody {
  reason?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor(VERIFICATION_REVOKE_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as RevokeBody | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!reason) {
    return NextResponse.json({ ok: false, message: "reason is required" }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ ok: false, message: "reason must be at most 500 characters" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "verification_revoke_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_user_id: userId,
      p_reason: reason,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_revoke_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to revoke verification", rpcError.code);
  }

  const result = (rpcData ?? null) as { user_id?: string; revoked_at?: string } | null;
  return NextResponse.json({
    ok: true,
    data: {
      userId: result?.user_id ?? userId,
      revokedAt: result?.revoked_at ?? new Date().toISOString(),
    },
  });
}
