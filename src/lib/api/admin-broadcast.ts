import { apiRequest } from "@/lib/api/http";

export type BroadcastAudience = "consigners" | "partners" | "all";

export interface BroadcastPreview {
  audience: BroadcastAudience;
  /** Active, unblocked users holding an Expo push token. */
  reachable: number;
  /** Everyone in the audience, whether reachable or not. */
  total: number;
  /** Signed up but no push token — app never opened on a device, or notifications denied. */
  noToken: number;
  /** push_outbox drains 100/minute, so a large send trickles out. */
  estimatedMinutes: number;
}

export interface BroadcastResult {
  queued: number;
  isTest: boolean;
  audience: string;
  estimatedMinutes: number;
}

export async function previewBroadcast(
  audience: BroadcastAudience,
): Promise<BroadcastPreview> {
  return apiRequest<BroadcastPreview>(
    `/api/admin/broadcast?audience=${encodeURIComponent(audience)}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function sendBroadcast(input: {
  audience: BroadcastAudience;
  title: string;
  message: string;
  actionUrl?: string | null;
  /** When set, the send goes only to this number and the audience is ignored. */
  testPhone?: string | null;
}): Promise<BroadcastResult> {
  return apiRequest<BroadcastResult>("/api/admin/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
