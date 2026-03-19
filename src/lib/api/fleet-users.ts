import { apiRequest } from "@/lib/api/http";

export interface AppUser {
  id: string;
  userType: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  isVerified: boolean;
  isActive: boolean;
  isBlocked: boolean;
  createdAt: string;
  accountId: string | null;
  accountName: string | null;
  documentsVerified: boolean | null;
  vehicleNumber: string | null;
  vehicleType: string | null;
}

export interface AppUserListResponse {
  total: number;
  items: AppUser[];
}

export interface ListAppUsersFilters {
  userType?: string;
  search?: string;
  isBlocked?: boolean;
  isVerified?: boolean;
  limit?: number;
  offset?: number;
}

function buildQuery(filters: ListAppUsersFilters = {}) {
  const params = new URLSearchParams();
  if (filters.userType) params.set("userType", filters.userType);
  if (filters.search) params.set("search", filters.search);
  if (typeof filters.isBlocked === "boolean") params.set("isBlocked", String(filters.isBlocked));
  if (typeof filters.isVerified === "boolean") params.set("isVerified", String(filters.isVerified));
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listAppUsers(
  filters: ListAppUsersFilters = {},
): Promise<AppUserListResponse> {
  return apiRequest<AppUserListResponse>(
    `/api/fleet/app-users${buildQuery(filters)}`,
    { method: "GET", cache: "no-store" },
  );
}
