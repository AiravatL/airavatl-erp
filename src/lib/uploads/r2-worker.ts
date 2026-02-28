export interface WorkerPresignPutResponse {
  upload_url?: string;
  object_key?: string;
  expires_in?: number;
  error?: string;
}

export interface WorkerPresignGetResponse {
  view_url?: string;
  expires_in?: number;
  error?: string;
}

interface WorkerConfig {
  baseUrl: string;
}

function firstNonEmptyEnv(keys: string[]): string {
  for (const key of keys) {
    const value = (process.env[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function getR2WorkerConfig(): WorkerConfig | null {
  const baseUrl = firstNonEmptyEnv([
    "R2_PRESIGN_WORKER_URL",
    "NEXT_PUBLIC_R2_PRESIGN_WORKER_URL",
    "CLOUDFLARE_R2_PRESIGN_WORKER_URL",
    "R2_WORKER_URL",
  ]).replace(/\/$/, "");
  if (!baseUrl) return null;
  return { baseUrl };
}

export function buildR2WorkerHeaders(accessToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}
