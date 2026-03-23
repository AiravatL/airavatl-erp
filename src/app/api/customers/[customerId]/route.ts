import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapCustomerRpcError, requireCustomerActor } from "@/app/api/customers/_shared";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string | null {
  return value != null ? String(value) : null;
}

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireCustomerActor("read");
  if ("error" in actorResult) return actorResult.error;

  const { customerId } = await context.params;
  if (!customerId) {
    return NextResponse.json({ ok: false, message: "customerId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("customer_get_v1", {
    p_actor: actorResult.actor.id,
    p_customer_id: customerId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: customer_get_v1" }, { status: 500 });
    }
    return mapCustomerRpcError(rpcError.message ?? "Unable to fetch customer", rpcError.code);
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as Record<string, unknown> | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: {
      id: row.id,
      name: row.name,
      address: str(row.address),
      gstin: str(row.gstin),
      panNumber: str(row.pan_number),
      natureOfBusiness: str(row.nature_of_business),
      contactDesignation: str(row.contact_designation),
      routeSummary: str(row.route_summary),
      vehicleRequirements: Array.isArray(row.vehicle_requirements) ? row.vehicle_requirements : [],
      estimatedMonthlyRevenue: row.estimated_monthly_revenue ? toNumber(row.estimated_monthly_revenue) : null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      creditDays: toNumber(row.credit_days),
      creditLimit: toNumber(row.credit_limit),
      salesOwnerId: str(row.sales_owner_id),
      salesOwnerName: str(row.sales_owner_name),
      active: Boolean(row.active),
      source: str(row.source),
      internalNotes: str(row.internal_notes),
      phone: str(row.phone),
      email: str(row.email),
      contactName: str(row.contact_name),
      businessName: str(row.business_name),
      activeTripsCount: toNumber(row.active_trips_count),
      totalTripsCount: toNumber(row.total_trips_count),
      totalBilled: toNumber(row.total_billed),
      outstandingAmount: toNumber(row.outstanding_amount),
      overdueAmount: toNumber(row.overdue_amount),
      totalReceived: toNumber(row.total_received),
      lastActivityAt: str(row.last_activity_at),
      createdAt: str(row.created_at) ?? "",
      updatedAt: str(row.updated_at) ?? "",
    },
  });
}

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireCustomerActor("write");
  if ("error" in actorResult) return actorResult.error;

  const { customerId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, message: "Body required" }, { status: 400 });

  const { data, error } = await actorResult.supabase.rpc("admin_consigner_update_v1", {
    p_consigner_id: customerId,
    p_registered_name: body.registeredName ?? null,
    p_billing_address: body.billingAddress ?? null,
    p_gstin: body.gstin ?? null,
    p_pan_number: body.panNumber ?? null,
    p_nature_of_business: body.natureOfBusiness ?? null,
    p_contact_designation: body.contactDesignation ?? null,
    p_route_summary: body.routeSummary ?? null,
    p_credit_days: body.creditDays != null ? Number(body.creditDays) : null,
    p_credit_limit: body.creditLimit != null ? Number(body.creditLimit) : null,
    p_internal_notes: body.internalNotes ?? null,
    p_active: body.active ?? null,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    return mapCustomerRpcError(error.message ?? "Update failed", error.code);
  }

  return NextResponse.json({ ok: true, data });
}
