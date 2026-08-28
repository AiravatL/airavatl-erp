import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import {
  buildR2WorkerHeaders,
  getR2WorkerConfig,
  type WorkerPresignGetResponse,
} from "@/lib/uploads/r2-worker";

/**
 * Serve the partner's uploaded UPI QR image from our own origin.
 *
 * The decoding itself now happens in the browser (see @/lib/qr/read-upi-qr) —
 * it used to run here via `sharp`, which cannot load on a Workers runtime.
 * The client still needs the pixels, and a canvas can only be read back if the
 * image is same-origin, so the bytes come through here rather than straight
 * from the presigned R2 URL. That also means no R2 CORS rule to keep in sync.
 *
 * Gated by requireVerificationActor, exactly as the decode route was.
 */

export const dynamic = "force-dynamic";

// Enough for the 10 MB cap DocumentUpload enforces, with room for slack.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * Trust the bytes, not the stored Content-Type.
 *
 * Partners choose what they upload, so echoing an attacker-influenced
 * Content-Type back on our own origin would hand them a stored-XSS primitive.
 * Sniffing the magic number means this route can only ever emit an image type,
 * and it also rescues objects R2 has as application/octet-stream.
 */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  const objectKey = `verification/${userId}/upi_qr/active`;

  const workerConfig = await getR2WorkerConfig();
  const { data: sessionData } = await actorResult.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;

  if (!workerConfig || !accessToken) {
    return NextResponse.json(
      { ok: false, message: "Missing server config for R2 presign worker" },
      { status: 500 },
    );
  }

  const presign = await fetch(`${workerConfig.baseUrl}/presign/get`, {
    method: "POST",
    headers: buildR2WorkerHeaders(accessToken),
    body: JSON.stringify({ objectKey }),
    cache: "no-store",
  }).catch(() => null);

  if (!presign) {
    return NextResponse.json(
      { ok: false, message: "Unable to reach R2 presign worker" },
      { status: 502 },
    );
  }

  const payload = (await presign.json().catch(() => null)) as WorkerPresignGetResponse | null;
  const viewUrl = payload?.view_url ?? payload?.download_url ?? null;
  if (!presign.ok || !viewUrl) {
    return NextResponse.json(
      { ok: false, message: "No UPI QR uploaded for this partner" },
      { status: 404 },
    );
  }

  const imageResponse = await fetch(viewUrl, { cache: "no-store" }).catch(() => null);
  if (!imageResponse?.ok) {
    return NextResponse.json(
      { ok: false, message: "Unable to download the QR image" },
      { status: 502 },
    );
  }

  const bytes = new Uint8Array(await imageResponse.arrayBuffer());

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { ok: false, message: "That QR file is too large to read" },
      { status: 413 },
    );
  }

  const contentType = sniffImageType(bytes);
  if (!contentType) {
    // The upi_qr slot accepts PDFs too, and a PDF has no pixels to scan.
    return NextResponse.json(
      {
        ok: false,
        message:
          "The uploaded UPI QR is not an image. Ask the partner for a photo or screenshot of the QR, or type the UPI ID manually.",
      },
      { status: 422 },
    );
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
