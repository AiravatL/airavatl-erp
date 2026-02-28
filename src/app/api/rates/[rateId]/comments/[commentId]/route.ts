import { NextResponse } from "next/server";
import {
  type RateCommentRow,
  normalizeRateCommentRow,
  requireRateActor,
} from "@/app/api/rates/_shared";

const COMMENT_MAX_LENGTH = 500;

interface RouteParams {
  params: Promise<{ rateId: string; commentId: string }>;
}

interface PatchBody {
  commentText?: unknown;
}

interface DeleteCommentResultRow {
  id: string;
  deleted: boolean;
}

function mapRpcError(message: string, code?: string) {
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "22023") {
    const lowerMessage = message.toLowerCase();
    const status = lowerMessage.includes("not found") ? 404 : 400;
    return NextResponse.json({ ok: false, message }, { status });
  }
  if (code === "22P02") return NextResponse.json({ ok: false, message }, { status: 400 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireRateActor();
  if ("error" in actorResult) return actorResult.error;

  const { rateId, commentId } = await context.params;
  if (!rateId || !commentId) {
    return NextResponse.json({ ok: false, message: "Missing rateId/commentId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const commentText = typeof body?.commentText === "string" ? body.commentText.trim() : "";
  if (!commentText) {
    return NextResponse.json({ ok: false, message: "commentText is required" }, { status: 400 });
  }
  if (commentText.length > COMMENT_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `commentText must be at most ${COMMENT_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_update_comment_v1", {
    p_rate_id: rateId,
    p_comment_id: commentId,
    p_comment_text: commentText,
    p_actor_user_id: actorResult.actor.id,
  } as never);
  if (rpcError) {
    return mapRpcError(rpcError.message ?? "Unable to update comment", rpcError.code);
  }

  const updatedComment = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as RateCommentRow | null)
    : ((rpcData ?? null) as RateCommentRow | null);
  if (!updatedComment) {
    return NextResponse.json({ ok: false, message: "Unable to update comment" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: normalizeRateCommentRow(updatedComment),
  });
}

export async function DELETE(_: Request, context: RouteParams) {
  const actorResult = await requireRateActor();
  if ("error" in actorResult) return actorResult.error;

  const { rateId, commentId } = await context.params;
  if (!rateId || !commentId) {
    return NextResponse.json({ ok: false, message: "Missing rateId/commentId" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_delete_comment_v1", {
    p_rate_id: rateId,
    p_comment_id: commentId,
    p_actor_user_id: actorResult.actor.id,
  } as never);
  if (rpcError) {
    return mapRpcError(rpcError.message ?? "Unable to delete comment", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as DeleteCommentResultRow | null)
    : ((rpcData ?? null) as DeleteCommentResultRow | null);
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to delete comment" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: row,
  });
}
