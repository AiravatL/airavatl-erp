import type { Role } from "@/lib/types";
import { apiRequest } from "@/lib/api/http";

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string | null;
}

export interface CreateAdminUserInput {
  fullName: string;
  email: string;
  role: Role;
  password: string;
  active: boolean;
}

export interface UpdateAdminUserInput {
  fullName?: string;
  role?: Role;
  active?: boolean;
  password?: string;
}

export interface RemoveAdminUserResult {
  id: string;
  removed: boolean;
  mode: "deactivated";
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  return apiRequest<AdminUserRow[]>("/api/admin/users", {
    method: "GET",
    cache: "no-store",
  });
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUserRow> {
  return apiRequest<AdminUserRow>("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function getAdminUser(userId: string): Promise<AdminUserRow> {
  return apiRequest<AdminUserRow>(`/api/admin/users/${userId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function updateAdminUser(
  userId: string,
  input: UpdateAdminUserInput,
): Promise<AdminUserRow> {
  return apiRequest<AdminUserRow>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function updateAdminUserStatus(
  userId: string,
  active: boolean,
): Promise<AdminUserRow> {
  return updateAdminUser(userId, { active });
}

export async function removeAdminUser(userId: string): Promise<RemoveAdminUserResult> {
  return apiRequest<RemoveAdminUserResult>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}
