import { apiRequest } from "@/lib/api/http";
import type { Lead, LeadActivity, LeadActivityType, LeadPriority, LeadSource, LeadStage } from "@/lib/types";

export interface ListConsignerLeadsFilters {
  search?: string;
  stage?: LeadStage | "all";
  priority?: LeadPriority | "all";
  limit?: number;
  offset?: number;
}

export interface CreateConsignerLeadInput {
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string;
  source: LeadSource;
  estimatedValue?: number | null;
  route?: string;
  vehicleType?: string;
  priority?: LeadPriority;
  notes?: string;
  nextFollowUp?: string | null;
}

export interface UpdateConsignerLeadInput {
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  estimatedValue?: number | null;
  route?: string;
  vehicleType?: string;
  priority?: LeadPriority;
  notes?: string;
  nextFollowUp?: string | null;
}

export interface MoveConsignerLeadStageInput {
  toStage: LeadStage;
  note?: string;
}

export interface AddConsignerLeadActivityInput {
  type: LeadActivityType;
  description: string;
}

export interface ConvertConsignerLeadInput {
  creditDays?: number;
  creditLimit?: number;
  address?: string;
  gstin?: string;
}

export interface WinConvertConsignerLeadInput {
  creditDays?: number;
  creditLimit?: number;
  address?: string;
  gstin?: string;
}

function buildQuery(filters: ListConsignerLeadsFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.priority) params.set("priority", filters.priority);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listConsignerLeads(filters: ListConsignerLeadsFilters = {}): Promise<Lead[]> {
  return apiRequest<Lead[]>(`/api/consigner-crm/leads${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function getConsignerLeadById(leadId: string): Promise<Lead> {
  return apiRequest<Lead>(`/api/consigner-crm/leads/${leadId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createConsignerLead(input: CreateConsignerLeadInput): Promise<Lead> {
  return apiRequest<Lead>("/api/consigner-crm/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateConsignerLead(leadId: string, input: UpdateConsignerLeadInput): Promise<Lead> {
  return apiRequest<Lead>(`/api/consigner-crm/leads/${leadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function moveConsignerLeadStage(
  leadId: string,
  input: MoveConsignerLeadStageInput,
): Promise<Lead> {
  return apiRequest<Lead>(`/api/consigner-crm/leads/${leadId}/stage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listConsignerLeadActivities(leadId: string): Promise<LeadActivity[]> {
  return apiRequest<LeadActivity[]>(`/api/consigner-crm/leads/${leadId}/activities`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function addConsignerLeadActivity(
  leadId: string,
  input: AddConsignerLeadActivityInput,
): Promise<LeadActivity> {
  return apiRequest<LeadActivity>(`/api/consigner-crm/leads/${leadId}/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function winAndConvertConsignerLead(
  leadId: string,
  input: WinConvertConsignerLeadInput,
): Promise<{ leadId: string; customerId: string; customerName: string }> {
  return apiRequest<{ leadId: string; customerId: string; customerName: string }>(
    `/api/consigner-crm/leads/${leadId}/win-convert`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function convertConsignerLead(
  leadId: string,
  input: ConvertConsignerLeadInput,
): Promise<{ customerId: string; customerName: string }> {
  return apiRequest<{ customerId: string; customerName: string }>(
    `/api/consigner-crm/leads/${leadId}/convert`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}
