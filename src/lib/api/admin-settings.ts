import { apiRequest } from "@/lib/api/http";

export interface PlatformSetting {
  key: string;
  value: Record<string, unknown>;
  description: string;
  updated_at: string;
}

export async function getPlatformSetting(key: string): Promise<PlatformSetting> {
  return apiRequest<PlatformSetting>(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function updatePlatformSetting(
  key: string,
  value: Record<string, unknown>,
): Promise<{ key: string }> {
  return apiRequest<{ key: string }>(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
}

// --- Platform Fees ---

export interface PlatformFeeSetting {
  value: number;
  min: number;
  max: number;
  description: string | null;
}

export type PlatformFees = Record<string, PlatformFeeSetting>;

export async function getPlatformFees(): Promise<PlatformFees> {
  return apiRequest<PlatformFees>("/api/admin/platform-fees", {
    method: "GET",
    cache: "no-store",
  });
}

export async function updatePlatformFees(
  settings: Array<{ key: string; value: number }>,
): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>("/api/admin/platform-fees", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
}
