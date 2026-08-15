function cors(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

function toAmzDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function toDateStamp(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function sha256Hex(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function getSigningKey(secretKey, dateStamp, region, service) {
  const kSecret = new TextEncoder().encode("AWS4" + secretKey);
  const kDate = await hmac(kSecret, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Legacy trip format remains supported:
// trips/{tripId}/{docType}-{timestamp}.{ext}
function buildTripKey({ tripId, docType, ext }) {
  return `trips/${tripId}/${docType}-${Date.now()}.${ext}`;
}

function normalizeObjectKey(objectKey) {
  return typeof objectKey === "string" ? objectKey.trim() : "";
}

function isValidObjectKey(objectKey, allowedKeyPrefixes) {
  const key = normalizeObjectKey(objectKey);
  if (!key) return false;
  if (key.includes("..")) return false;
  if (key.startsWith("/")) return false;
  return allowedKeyPrefixes.some((prefix) => key.startsWith(prefix));
}

// Validate Supabase token by calling /auth/v1/user
async function getSupabaseUserId(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: auth,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data?.id || null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors(origin) });
    }

    const userId = await getSupabaseUserId(request, env);
    if (!userId) {
      return new Response("Unauthorized", { status: 401, headers: cors(origin) });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, origin);
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    const allowedTripDocTypes = ["loading", "pod", "eway"];
    const allowedExt = ["jpg", "jpeg", "png", "webp", "pdf"];
    const allowedKeyPrefixes = ["trips/", "verification/"];

    const accountId = env.R2_ACCOUNT_ID;
    const bucket = env.R2_BUCKET_NAME;

    if (!accountId || !bucket) {
      return json({ error: "Missing R2_ACCOUNT_ID or R2_BUCKET_NAME in Worker vars" }, 500, origin);
    }

    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      return json({ error: "Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY in Worker secrets" }, 500, origin);
    }

    const host = `${accountId}.r2.cloudflarestorage.com`;
    const endpoint = `https://${host}`;
    const service = "s3";
    const region = "auto";
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = toDateStamp(now);
    const expires = 300;

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const signedHeaders = "host";
    const canonicalHeaders = `host:${host}\n`;
    const payloadHash = "UNSIGNED-PAYLOAD";

    if (pathname.endsWith("/presign/put")) {
      let objectKey;

      if (body.objectKey !== undefined) {
        if (!isValidObjectKey(body.objectKey, allowedKeyPrefixes)) {
          return json({ error: "Invalid objectKey" }, 400, origin);
        }

        objectKey = normalizeObjectKey(body.objectKey);
      } else {
        const { tripId, docType, fileExt } = body;

        if (!tripId || !allowedTripDocTypes.includes(docType)) {
          return json({ error: "Invalid tripId or docType" }, 400, origin);
        }

        const ext = (fileExt || "bin").toLowerCase();
        if (!allowedExt.includes(ext)) {
          return json({ error: "Unsupported fileExt" }, 400, origin);
        }

        objectKey = buildTripKey({ tripId, docType, ext });
      }

      const encodedKey = objectKey.split("/").map(encodeRfc3986).join("/");
      const canonicalUri = `/${bucket}/${encodedKey}`;
      const credential = `${accessKeyId}/${credentialScope}`;

      const qp = new URLSearchParams();
      qp.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
      qp.set("X-Amz-Credential", credential);
      qp.set("X-Amz-Date", amzDate);
      qp.set("X-Amz-Expires", String(expires));
      qp.set("X-Amz-SignedHeaders", signedHeaders);

      const canonicalQueryString = [...qp.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
        .join("&");

      const canonicalRequest =
        `PUT\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      const canonicalRequestHash = await sha256Hex(canonicalRequest);

      const stringToSign =
        `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

      const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, service);
      const signatureBytes = await hmac(signingKey, stringToSign);
      const signature = bytesToHex(signatureBytes);

      const presignedUrl = `${endpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

      return json(
        {
          upload_url: presignedUrl,
          object_key: objectKey,
          expires_in: expires,
          user_id: userId,
        },
        200,
        origin
      );
    }

    if (pathname.endsWith("/presign/get")) {
      const { objectKey } = body;

      if (!isValidObjectKey(objectKey, allowedKeyPrefixes)) {
        return json({ error: "Invalid objectKey" }, 400, origin);
      }

      const normalizedKey = normalizeObjectKey(objectKey);
      const encodedKey = normalizedKey.split("/").map(encodeRfc3986).join("/");
      const canonicalUri = `/${bucket}/${encodedKey}`;
      const credential = `${accessKeyId}/${credentialScope}`;

      const qp = new URLSearchParams();
      qp.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
      qp.set("X-Amz-Credential", credential);
      qp.set("X-Amz-Date", amzDate);
      qp.set("X-Amz-Expires", String(expires));
      qp.set("X-Amz-SignedHeaders", signedHeaders);

      const canonicalQueryString = [...qp.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
        .join("&");

      const canonicalRequest =
        `GET\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      const canonicalRequestHash = await sha256Hex(canonicalRequest);

      const stringToSign =
        `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

      const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, service);
      const signatureBytes = await hmac(signingKey, stringToSign);
      const signature = bytesToHex(signatureBytes);

      const presignedUrl = `${endpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

      return json(
        {
          download_url: presignedUrl,
          object_key: normalizedKey,
          expires_in: expires,
          user_id: userId,
        },
        200,
        origin
      );
    }

    return json({ error: "Unknown endpoint" }, 404, origin);
  },
};