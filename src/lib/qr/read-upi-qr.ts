import jsQR from "jsqr";

/**
 * Read the UPI ID out of a QR image, in the browser.
 *
 * This used to run server-side with `sharp`, which is a native libvips binding
 * and cannot load on Cloudflare Workers — the route threw on import, so every
 * call came back as a bare "Request failed" in production while working fine
 * against `next dev` locally. The browser already ships an image decoder that
 * handles JPEG/PNG/WebP better than any JS polyfill, so the work belongs here.
 *
 * A UPI QR is a deeplink: upi://pay?pa=ramesh@okaxis&pn=Ramesh%20Kumar&...
 * The `pa` parameter IS the UPI ID.
 *
 * `pn` (payee name) is deliberately ignored — it is a self-set nickname, not a
 * bank record, and must never be presented to ops as a verified name.
 *
 * Nothing here is a trust boundary: ops confirm the value in the field before
 * saving, and erp.is_valid_upi_vpa_v1 is what actually enforces the format.
 */

const VPA_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/;

/** Pull the VPA out of a upi:// deeplink, or accept a bare VPA. */
export function vpaFromQrPayload(raw: string): string | null {
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

/**
 * A blob: URL is same-origin, so drawing this image never taints the canvas —
 * that is the whole reason the bytes are proxied through our own API route
 * rather than fetched from the presigned R2 URL directly.
 */
function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    image.src = url;
  });
}

/**
 * Flatten to grayscale and stretch the contrast to the full range. Low contrast
 * on a crumpled or badly lit sticker is the usual reason a first pass fails.
 */
function grayscaleAndNormalise(imageData: ImageData): void {
  const data = imageData.data;
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const luma = Math.round((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000);
    data[i] = luma;
    data[i + 1] = luma;
    data[i + 2] = luma;
    if (luma < min) min = luma;
    if (luma > max) max = luma;
  }

  const range = max - min;
  // Already spans the full range (or is a flat image) — stretching does nothing.
  if (range <= 0 || range >= 255) return;

  const scale = 255 / range;
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.round((data[i] - min) * scale);
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
}

function readPixels(
  image: HTMLImageElement,
  maxWidth: number | null,
  enhance: boolean,
): ImageData | null {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) return null;

  const scale = maxWidth && naturalWidth > maxWidth ? maxWidth / naturalWidth : 1;
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  if (enhance) grayscaleAndNormalise(pixels);
  return pixels;
}

// A phone photo of a printed QR is often large and slightly off-angle.
// Downscale first (fastest, and jsQR locates finder patterns more reliably at a
// moderate size), then retry at full size, then with contrast stretched.
const ATTEMPTS: ReadonlyArray<{ maxWidth: number | null; enhance: boolean }> = [
  { maxWidth: 1000, enhance: false },
  { maxWidth: null, enhance: false },
  { maxWidth: null, enhance: true },
];

/** Decode the QR payload, or null if no QR could be located. */
export async function decodeQrFromBlob(blob: Blob): Promise<string | null> {
  const image = await blobToImage(blob);

  for (const attempt of ATTEMPTS) {
    const pixels = readPixels(image, attempt.maxWidth, attempt.enhance);
    if (!pixels) continue;

    const result = jsQR(pixels.data, pixels.width, pixels.height, {
      inversionAttempts: "attemptBoth",
    });
    if (result?.data) return result.data;
  }

  return null;
}

/**
 * Decode a QR image and return the UPI ID inside it.
 * Throws with an ops-readable message when the image cannot be used.
 */
export async function readUpiIdFromBlob(blob: Blob): Promise<string> {
  const decoded = await decodeQrFromBlob(blob);

  if (!decoded) {
    throw new Error(
      "No QR code found in the image. Ask the partner to resend a clearer photo, or type the UPI ID manually.",
    );
  }

  const upiId = vpaFromQrPayload(decoded);
  if (!upiId) {
    // Some bank-issued QRs are Bharat QR / EMVCo TLV rather than upi://, and
    // some QRs on a payment sticker aren't UPI at all.
    throw new Error(
      "That QR does not contain a UPI ID. Ask the partner to use the 'My QR' screen in their UPI app, or type the ID manually.",
    );
  }

  return upiId;
}
