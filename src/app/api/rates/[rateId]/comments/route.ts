import { NextResponse } from "next/server";
import {
  type RateCommentRow,
  normalizeRateCommentRow,
  requireRateActor,
} from "@/app/api/rates/_shared";

export const dynamic = "force-dynamic";
const COMMENT_MAX_LENGTH = 500;

interface RouteParams {
  params: Promise<{ rateId: string }>;
}

interface CommentBody {
  commentText?: unknown;
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

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireRateActor();
  if ("error" in actorResult) return actorResult.error;

  const { rateId } = await context.params;
  if (!rateId) {
    return NextResponse.json({ ok: false, message: "Missing rateId" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_list_comments_v1", {
    p_rate_id: rateId,
    p_limit: 200,
    p_offset: 0,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRpcError(rpcError.message ?? "Unable to fetch comments", rpcError.code);
  }

  const rows = Array.isArray(rpcData)
    ? (rpcData as RateCommentRow[])
    : rpcData
      ? ([rpcData] as RateCommentRow[])
      : [];
  const mappedRows = rows.map((row) => normalizeRateCommentRow(row));

  return NextResponse.json({ ok: true, data: mappedRows });
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireRateActor();
  if ("error" in actorResult) return actorResult.error;

  const { rateId } = await context.params;
  if (!rateId) {
    return NextResponse.json({ ok: false, message: "Missing rateId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as CommentBody | null;
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

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_add_comment_v1", {
    p_rate_id: rateId,
    p_comment_text: commentText,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRpcError(rpcError.message ?? "Unable to add comment", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as RateCommentRow | null)
    : ((rpcData ?? null) as RateCommentRow | null);
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to add comment" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRateCommentRow(row) }, { status: 201 });
}
