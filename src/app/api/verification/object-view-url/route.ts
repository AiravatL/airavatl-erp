import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import {
  buildR2WorkerHeaders,
  getR2WorkerConfig,
  type WorkerPresignGetResponse,
} from "@/lib/uploads/r2-worker";

/**
 * Presigned GET for a verification document.
 *
 * Deliberately NOT reusing /api/payments/object-view-url: that route is gated by
 * requirePaymentActor, a different role set. Verification is
 * super_admin / admin / sales_vehicles.
 *
 * Not user-scoped in the path so the shared <SignedImagePreview> can keep its
 * (objectKey) => … fetch signature. The owner is already inside the key, and the
 * role gate does the authorising.
 */

interface ViewUrlBody {
  objectKey?: unknown;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as ViewUrlBody | null;
  const objectKey = toTrimmedString(body?.objectKey);

  // Refuse anything that isn't a verification key before touching the worker —
  // this route's role gate is not the right one for trip or payment objects.
  if (!objectKey.startsWith("verification/") || objectKey.includes("..")) {
    return NextResponse.json({ ok: false, message: "Invalid objectKey" }, { status: 400 });
  }

  const workerConfig = await getR2WorkerConfig();
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
    return NextResponse.json(
      { ok: false, message: "Unable to reach R2 presign worker" },
      { status: 502 },
    );
  }

  const payload = (await response.json().catch(() => null)) as WorkerPresignGetResponse | null;
  // The worker has returned download_url since Aug 2026; older deploys returned
  // view_url. Accept either.
  const viewUrl = payload?.view_url ?? payload?.download_url ?? null;
  if (!response.ok || !viewUrl) {
    return NextResponse.json(
      { ok: false, message: payload?.error || "Unable to generate file view URL" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      viewUrl,
      expiresIn: typeof payload?.expires_in === "number" ? payload.expires_in : null,
    },
  });
}
