import { apiRequest } from "@/lib/api/http";
import type { TripStage } from "@/lib/types";

export interface CustomerListItem {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  creditDays: number;
  creditLimit: number;
  salesOwnerId: string | null;
  salesOwnerName: string | null;
  active: boolean;
  activeTripsCount: number;
  outstandingAmount: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CustomerDetail = CustomerListItem;

export interface CustomerTripItem {
  id: string;
  tripCode: string;
  route: string | null;
  currentStage: TripStage;
  scheduleDate: string | null;
  vehicleNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerReceivableItem {
  id: string;
  tripId: string;
  tripCode: string | null;
  amount: number;
  dueDate: string | null;
  collectedStatus: "pending" | "partial" | "collected" | "overdue";
  agingBucket: "0-7" | "8-15" | "16-30" | "30+";
  followUpStatus: string | null;
  followUpNotes: string | null;
  collectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCustomersFilters {
  search?: string;
  status?: "active" | "inactive";
  ownerId?: string;
  creditHealth?: "within_limit" | "over_limit";
  limit?: number;
  offset?: number;
}

export interface PaginationInput {
  limit?: number;
  offset?: number;
}

function buildQuery(paramsInput: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(paramsInput)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listCustomers(filters: ListCustomersFilters = {}): Promise<CustomerListItem[]> {
  return apiRequest<CustomerListItem[]>(
    `/api/customers${buildQuery({
      search: filters.search,
      status: filters.status,
      ownerId: filters.ownerId,
      creditHealth: filters.creditHealth,
      limit: filters.limit,
      offset: filters.offset,
    })}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function getCustomerById(customerId: string): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(`/api/customers/${customerId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function listCustomerTrips(
  customerId: string,
  pagination: PaginationInput = {},
): Promise<CustomerTripItem[]> {
  return apiRequest<CustomerTripItem[]>(
    `/api/customers/${customerId}/trips${buildQuery({
      limit: pagination.limit,
      offset: pagination.offset,
    })}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function listCustomerReceivables(
  customerId: string,
  pagination: PaginationInput = {},
): Promise<CustomerReceivableItem[]> {
  return apiRequest<CustomerReceivableItem[]>(
    `/api/customers/${customerId}/receivables${buildQuery({
      limit: pagination.limit,
      offset: pagination.offset,
    })}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}
