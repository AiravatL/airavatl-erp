import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

// Broadcasting to every app user is not a support action — it is a publishing
// one, and it cannot be recalled. Narrower than admin_send_notification_v1,
// which also allows support to message a single user.
const BROADCAST_ROLES = ["super_admin", "admin"] as const;

const AUDIENCES = ["consigners", "partners", "all"] as const;

// Caps mirror the RPC. Android shows one line of title and iOS truncates at
// roughly the same point, so anything longer is lost rather than shown.
const TITLE_MAX = 65;
const MESSAGE_MAX = 240;

type SendBody = {
  audience: (typeof AUDIENCES)[number];
  title: string;
  message: string;
  actionUrl: string | null;
  testPhone: string | null;
};

function parseSendBody(raw: unknown): { body: SendBody } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid request" };
  const input = raw as Record<string, unknown>;

  const audience = typeof input.audience === "string" ? input.audience : "";
  if (!AUDIENCES.includes(audience as SendBody["audience"])) {
    return { error: "Unknown audience" };
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { error: "Title is required" };
  if (title.length > TITLE_MAX) {
    return { error: `Title must be ${TITLE_MAX} characters or fewer` };
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) return { error: "Message is required" };
  if (message.length > MESSAGE_MAX) {
    return { error: `Message must be ${MESSAGE_MAX} characters or fewer` };
  }

  const actionUrl = typeof input.actionUrl === "string" ? input.actionUrl.trim() : "";
  if (actionUrl.length > 300) return { error: "Action link is too long" };

  const testPhone = typeof input.testPhone === "string" ? input.testPhone.trim() : "";
  if (testPhone.length > 20) return { error: "Test number is too long" };

  return {
    body: {
      audience: audience as SendBody["audience"],
      title,
      message,
      actionUrl: actionUrl || null,
      testPhone: testPhone || null,
    },
  };
}

/** RPC exceptions are bare codes; turn them into something an operator reads. */
const RPC_MESSAGES: Record<string, { message: string; status: number }> = {
  invalid_audience: { message: "Unknown audience", status: 400 },
  title_required: { message: "Title is required", status: 400 },
  message_required: { message: "Message is required", status: 400 },
  title_too_long: { message: "Title must be 65 characters or fewer", status: 400 },
  message_too_long: { message: "Message must be 240 characters or fewer", status: 400 },
  no_recipients: {
    message: "Nobody in this audience has the app installed with notifications on",
    status: 400,
  },
  test_recipient_not_found: {
    message: "No app user with that number has notifications enabled",
    status: 404,
  },
};

function mapRpcError(error: { message?: string }) {
  const raw = error.message ?? "";
  const match = Object.keys(RPC_MESSAGES).find((code) => raw.includes(code));
  if (match) {
    const entry = RPC_MESSAGES[match];
    return NextResponse.json({ ok: false, message: entry.message }, { status: entry.status });
  }
  if (raw.includes("forbidden") || raw.includes("access")) {
    return NextResponse.json({ ok: false, message: "Not allowed" }, { status: 403 });
  }
  return NextResponse.json({ ok: false, message: raw || "Unable to send" }, { status: 500 });
}

/** Preview — how many people a send would actually reach. */
export async function GET(request: Request) {
  const actorResult = await requireServerActor(BROADCAST_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const audience = new URL(request.url).searchParams.get("audience") ?? "";
  if (!AUDIENCES.includes(audience as (typeof AUDIENCES)[number])) {
    return NextResponse.json({ ok: false, message: "Unknown audience" }, { status: 400 });
  }

  const { data, error } = await actorResult.supabase.rpc(
    "admin_broadcast_preview_v1",
    { p_audience: audience, p_actor_user_id: actorResult.actor.id } as never,
  );

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_broadcast_preview_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error);
  }

  return NextResponse.json({ ok: true, data });
}

export async function POST(request: Request) {
  const actorResult = await requireServerActor(BROADCAST_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const raw = await request.json().catch(() => null);
  const parsed = parseSendBody(raw);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, message: parsed.error }, { status: 400 });
  }

  const { audience, title, message, actionUrl, testPhone } = parsed.body;

  const { data, error } = await actorResult.supabase.rpc(
    "admin_broadcast_notification_v1",
    {
      p_audience: audience,
      p_title: title,
      p_message: message,
      p_action_url: actionUrl || null,
      p_test_phone: testPhone || null,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_broadcast_notification_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error);
  }

  return NextResponse.json({ ok: true, data });
}
