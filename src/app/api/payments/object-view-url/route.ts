import { NextResponse } from "next/server";
import { requirePaymentActor } from "@/app/api/payments/_shared";
import {
  buildR2WorkerHeaders,
  getR2WorkerConfig,
  type WorkerPresignGetResponse,
} from "@/lib/uploads/r2-worker";

interface ViewUrlBody {
  objectKey?: unknown;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const actorResult = await requirePaymentActor();
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as ViewUrlBody | null;
  const objectKey = toTrimmedString(body?.objectKey);

  if (!objectKey) {
    return NextResponse.json({ ok: false, message: "objectKey is required" }, { status: 400 });
  }

  const workerConfig = getR2WorkerConfig();
  const { data: sessionData } = await actorResult.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;

  if (!workerConfig) {
    return NextResponse.json(
      { ok: false, message: "Missing server config: R2_PRESIGN_WORKER_URL" },
      { status: 500 },
    );
  }
  if (!accessToken) {
    return NextResponse.json(
      { ok: false, message: "Missing worker auth context: no session access token" },
      { status: 500 },
    );
  }

  const response = await fetch(`${workerConfig.baseUrl}/presign/get`, {
    method: "POST",
    headers: buildR2WorkerHeaders(accessToken),
    body: JSON.stringify({ objectKey }),
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return NextResponse.json({ ok: false, message: "Unable to reach R2 presign worker" }, { status: 502 });
  }

  const payload = (await response.json().catch(() => null)) as WorkerPresignGetResponse | null;
  if (!response.ok || !payload?.view_url) {
    return NextResponse.json({ ok: false, message: payload?.error || "Unable to generate file view URL" }, { status: 502 });
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;

  return NextResponse.json({
    ok: true,
    data: {
      viewUrl: payload.view_url,
      expiresIn,
    },
  });
}
