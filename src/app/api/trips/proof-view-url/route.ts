import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import {
  buildR2WorkerHeaders,
  getR2WorkerConfig,
  type WorkerPresignGetResponse,
} from "@/lib/uploads/r2-worker";

export async function POST(request: Request) {
  const actorResult = await requireServerActor();
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as { objectKey?: unknown } | null;
  const objectKey = typeof body?.objectKey === "string" ? body.objectKey.trim() : "";

  if (!objectKey) {
    return NextResponse.json({ ok: false, message: "objectKey is required" }, { status: 400 });
  }

  const workerConfig = await getR2WorkerConfig();
  const { data: sessionData } = await actorResult.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;

  if (!workerConfig) {
    return NextResponse.json({ ok: false, message: "R2 worker not configured" }, { status: 500 });
  }
  if (!accessToken) {
    return NextResponse.json({ ok: false, message: "No session token" }, { status: 500 });
  }

  const response = await fetch(`${workerConfig.baseUrl}/presign/get`, {
    method: "POST",
    headers: buildR2WorkerHeaders(accessToken),
    body: JSON.stringify({ objectKey }),
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return NextResponse.json({ ok: false, message: "Unable to reach R2 worker" }, { status: 502 });
  }

  const payload = (await response.json().catch(() => null)) as WorkerPresignGetResponse | null;
  const viewUrl = payload?.view_url ?? payload?.download_url ?? null;
  if (!response.ok || !viewUrl) {
    return NextResponse.json({ ok: false, message: payload?.error || "Unable to generate view URL" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    data: { viewUrl, expiresIn: payload?.expires_in ?? null },
  });
}
