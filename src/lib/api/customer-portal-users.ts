import { apiRequest } from "@/lib/api/http";

export interface CustomerPortalUser {
  id: string;
  customerId: string;
  authUserId: string;
  email: string;
  fullName: string;
  role: "viewer" | "manager";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface CreateCustomerPortalUserInput {
  fullName: string;
  email: string;
  password: string;
  role: "viewer" | "manager";
  active: boolean;
}

export interface UpdateCustomerPortalUserInput {
  fullName?: string;
  role?: "viewer" | "manager";
  active?: boolean;
  password?: string;
}

export async function listCustomerPortalUsers(customerId: string): Promise<CustomerPortalUser[]> {
  return apiRequest<CustomerPortalUser[]>(`/api/customers/${customerId}/portal-users`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createCustomerPortalUser(
  customerId: string,
  input: CreateCustomerPortalUserInput,
): Promise<CustomerPortalUser> {
  return apiRequest<CustomerPortalUser>(`/api/customers/${customerId}/portal-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateCustomerPortalUser(
  customerId: string,
  portalUserId: string,
  input: UpdateCustomerPortalUserInput,
): Promise<CustomerPortalUser> {
  return apiRequest<CustomerPortalUser>(
    `/api/customers/${customerId}/portal-users/${portalUserId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteCustomerPortalUser(
  customerId: string,
  portalUserId: string,
): Promise<{ id: string; removed: boolean }> {
  return apiRequest<{ id: string; removed: boolean }>(
    `/api/customers/${customerId}/portal-users/${portalUserId}`,
    { method: "DELETE" },
  );
}
