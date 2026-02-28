import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireVehicleCrmActor } from "@/app/api/vehicle-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

interface OnboardBody {
  onboardMode?: unknown;
  existingVendorId?: unknown;
  vendorName?: unknown;
  vendorPhone?: unknown;
  vendorNotes?: unknown;
}

const VENDOR_NAME_MAX_LENGTH = 120;
const VENDOR_NOTES_MAX_LENGTH = 500;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

function mapRpcError(message: string, code?: string) {
  if (message?.includes("forbidden")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (message?.includes("not_found")) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  if (message?.includes("lead_already_converted")) return NextResponse.json({ ok: false, message: "Lead has already been converted" }, { status: 400 });
  if (message?.includes("use_conversion_flow")) return NextResponse.json({ ok: false, message: "Use the onboard endpoint" }, { status: 400 });
  if (message?.includes("already_in_stage")) return NextResponse.json({ ok: false, message: "Lead is already in this stage" }, { status: 400 });
  if (message?.includes("vendor_name_required")) return NextResponse.json({ ok: false, message: "Vendor name is required" }, { status: 400 });
  if (message?.includes("vendor_phone_required")) return NextResponse.json({ ok: false, message: "Vendor phone is required" }, { status: 400 });
  if (message?.includes("existing_vendor_id_required")) return NextResponse.json({ ok: false, message: "Select a vendor to attach" }, { status: 400 });
  if (message?.includes("validation_error")) return NextResponse.json({ ok: false, message }, { status: 400 });
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireVehicleCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as OnboardBody | null;
  const onboardMode =
    body?.onboardMode === "attach_to_existing_vendor" ? "attach_to_existing_vendor" : "create_new_vendor";
  const existingVendorId = typeof body?.existingVendorId === "string" ? body.existingVendorId.trim() : "";
  const vendorName = typeof body?.vendorName === "string" ? body.vendorName.trim() : "";
  const vendorPhone = typeof body?.vendorPhone === "string" ? body.vendorPhone.trim() : "";
  const vendorNotes = typeof body?.vendorNotes === "string" ? body.vendorNotes.trim() : null;
  const vendorPhoneDigits = vendorPhone.replace(/\D/g, "");

  if (onboardMode === "attach_to_existing_vendor") {
    if (!existingVendorId) {
      return NextResponse.json({ ok: false, message: "existingVendorId is required" }, { status: 400 });
    }
  } else {
    if (!vendorName || !vendorPhone) {
      return NextResponse.json(
        { ok: false, message: "vendorName and vendorPhone are required" },
        { status: 400 },
      );
    }
    if (vendorName.length > VENDOR_NAME_MAX_LENGTH) {
      return NextResponse.json(
        { ok: false, message: `vendorName must be at most ${VENDOR_NAME_MAX_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (vendorPhoneDigits.length < PHONE_MIN_DIGITS || vendorPhoneDigits.length > PHONE_MAX_DIGITS) {
      return NextResponse.json(
        { ok: false, message: `vendorPhone must have ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits` },
        { status: 400 },
      );
    }
  }
  if (vendorNotes && vendorNotes.length > VENDOR_NOTES_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vendorNotes must be at most ${VENDOR_NOTES_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const v2Result = await actorResult.supabase.rpc("vehicle_lead_onboard_v2", {
    p_actor_user_id: actorResult.actor.id,
    p_lead_id: leadId,
    p_onboard_mode: onboardMode,
    p_vendor_name: onboardMode === "create_new_vendor" ? vendorName : null,
    p_vendor_phone: onboardMode === "create_new_vendor" ? vendorPhone : null,
    p_vendor_notes: vendorNotes,
    p_existing_vendor_id: onboardMode === "attach_to_existing_vendor" ? existingVendorId : null,
  } as never);

  let rpcData: unknown = null;
  let rpcError: { message?: string; code?: string } | null = null;

  if (v2Result.error && isMissingRpcError(v2Result.error)) {
    if (onboardMode === "attach_to_existing_vendor") {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_lead_onboard_v2" },
        { status: 500 },
      );
    }
    const v1Result = await actorResult.supabase.rpc("vehicle_lead_onboard_v1", {
      p_actor_user_id: actorResult.actor.id,
      p_lead_id: leadId,
      p_vendor_name: vendorName,
      p_vendor_phone: vendorPhone,
      p_vendor_notes: vendorNotes,
    } as never);
    rpcData = v1Result.data;
    rpcError = v1Result.error ? { message: v1Result.error.message, code: v1Result.error.code } : null;
  } else {
    rpcData = v2Result.data;
    rpcError = v2Result.error ? { message: v2Result.error.message, code: v2Result.error.code } : null;
  }

  if (rpcError) {
    if (isMissingRpcError(rpcError as never)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_lead_onboard_v1/vehicle_lead_onboard_v2" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to onboard vehicle lead", rpcError.code);
  }

  const row = rpcData as { lead_id: string; vendor_id: string; vehicle_id: string } | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to onboard vehicle lead" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        leadId: row.lead_id,
        vendorId: row.vendor_id,
        vehicleId: row.vehicle_id,
      },
    },
    { status: 201 },
  );
}
