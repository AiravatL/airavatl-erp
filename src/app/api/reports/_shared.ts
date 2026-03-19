import type { Role } from "@/lib/types";

export const REPORT_ROLES: readonly Role[] = ["super_admin", "admin", "accounts", "operations"];

export function parsePaginationParams(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  return { searchParams, search, status, limit: safeLimit, offset: safeOffset };
}
