import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;

  const { data, error } = await actorResult.supabase.rpc(
    "transporter_fleet_list_v1",
    { p_actor_user_id: actorResult.actor.id, p_transporter_user_id: userId } as never,
  );

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: transporter_fleet_list_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to load fleet", error.code);
  }

  const payload = data as { success: boolean; data?: any; error?: string } | null;
  if (!payload?.success) {
    return NextResponse.json(
      { ok: false, message: payload?.error ?? "Unable to load fleet" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, data: payload.data });
}
