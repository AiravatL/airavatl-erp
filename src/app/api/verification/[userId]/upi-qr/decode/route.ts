import { NextResponse } from "next/server";
import jsQR from "jsqr";
import sharp from "sharp";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import {
  buildR2WorkerHeaders,
  getR2WorkerConfig,
  type WorkerPresignGetResponse,
} from "@/lib/uploads/r2-worker";

/**
 * Read the UPI ID out of a QR the partner uploaded.
 *
 * Decoding happens here rather than on the device because expo-camera (whose
 * native scanner would do this) is not a dependency of apps/partner — adding it
 * would force a new store build instead of an OTA update. The partner just
 * uploads a photo through the normal document pipeline; we do the reading.
 *
 * A UPI QR is a deeplink: upi://pay?pa=ramesh@okaxis&pn=Ramesh%20Kumar&...
 * The `pa` parameter IS the UPI ID.
 *
 * `pn` (payee name) is deliberately ignored — it is a self-set nickname, not a
 * bank record, and must never be presented to ops as a verified name.
 */

// QR photos are camera shots, not screenshots — decoding needs real pixels.
export const runtime = "nodejs";
export const maxDuration = 20;

const VPA_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/;

/** Pull the VPA out of a upi:// deeplink, or accept a bare VPA. */
function vpaFromQrPayload(raw: string): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  const match = /[?&]pa=([^&\s]+)/i.exec(input);
  let candidate = match ? match[1] : input;
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // Malformed percent-encoding — fall through with the raw value.
  }
  candidate = candidate.trim();
  return VPA_RE.test(candidate) ? candidate.toLowerCase() : null;
}

export async function POST(
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

  const bytes = Buffer.from(await imageResponse.arrayBuffer());

  let decoded: string | null = null;
  try {
    // A phone photo of a printed QR is often large and slightly off-angle.
    // Downscale, then retry at full size and with a grayscale+normalised pass —
    // low contrast on a crumpled sticker is the usual reason a first pass fails.
    const attempts = [
      sharp(bytes).resize({ width: 1000, withoutEnlargement: true }),
      sharp(bytes),
      sharp(bytes).grayscale().normalise(),
    ];

    for (const pipeline of attempts) {
      const { data, info } = await pipeline
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
      if (result?.data) {
        decoded = result.data;
        break;
      }
    }
  } catch (error) {
    console.error("[upi-qr/decode] Failed to process image:", error);
    return NextResponse.json(
      { ok: false, message: "Could not read that image" },
      { status: 422 },
    );
  }

  if (!decoded) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "No QR code found in the image. Ask the partner to resend a clearer photo, or type the UPI ID manually.",
      },
      { status: 422 },
    );
  }

  const upiId = vpaFromQrPayload(decoded);
  if (!upiId) {
    // Some bank-issued QRs are Bharat QR / EMVCo TLV rather than upi://, and
    // some QRs on a payment sticker aren't UPI at all.
    return NextResponse.json(
      {
        ok: false,
        message:
          "That QR does not contain a UPI ID. Ask the partner to use the 'My QR' screen in their UPI app, or type the ID manually.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, data: { upiId } });
}
