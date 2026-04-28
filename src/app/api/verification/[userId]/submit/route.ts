import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";
import {
  createDriverFundAccount,
  RazorpayXOnboardingError,
  type DriverType,
  type PayoutMethod,
} from "@/lib/payouts/razorpayx";
import type { SupabaseClient } from "@supabase/supabase-js";

interface SubmitBody {
  // Driver fields
  licenseNumber?: unknown;
  licenseExpiryDate?: unknown;
  dlPhotoKey?: unknown;
  registrationNumber?: unknown;
  vehicleMasterTypeId?: unknown;
  rcPhotoKey?: unknown;
  // Transporter fields
  transportLicenseNumber?: unknown;
  transportLicenseExpiry?: unknown;
  licensePhotoKey?: unknown;
  // Common fields
  aadharNumber?: unknown;
  aadharPhotoKey?: unknown;
  bankAccountNumber?: unknown;
  bankIfscCode?: unknown;
  bankAccountHolderName?: unknown;
  upiId?: unknown;
  gstNumber?: unknown;
  panNumber?: unknown;
  notes?: unknown;
}

function toStr(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

interface PayoutOnboardingResult {
  status: "active" | "pending_razorpayx";
  razorpayxContactId?: string;
  razorpayxFundAccountId?: string;
  error?: { code: string; message: string };
}

/**
 * After the verification RPC has written the row in
 * `pending_razorpayx` state, create the RazorpayX contact + fund
 * account and call the finalize RPC. If the HTTP onboarding fails the
 * driver row stays in pending — the admin can retry without losing
 * the verified KYC state.
 */
async function onboardRazorpayX(opts: {
  supabase: SupabaseClient;
  actorUserId: string;
  partnerUserId: string;
  driverType: DriverType;
  payoutMethod: PayoutMethod;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  bankAccountHolderName: string | null;
  upiVpa: string | null;
}): Promise<PayoutOnboardingResult> {
  const {
    supabase, actorUserId, partnerUserId, driverType, payoutMethod,
    bankAccountNumber, bankIfscCode, bankAccountHolderName, upiVpa,
  } = opts;

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("full_name, phone")
    .eq("id", partnerUserId)
    .single();

  if (profileError || !profile?.full_name || !profile?.phone) {
    return {
      status: "pending_razorpayx",
      error: {
        code: "PROFILE_LOOKUP_FAILED",
        message: profileError?.message ?? "Could not load partner profile for RazorpayX onboarding",
      },
    };
  }

  try {
    const { contactId, fundAccountId } = await createDriverFundAccount({
      userId: partnerUserId,
      fullName: profile.full_name,
      phone: profile.phone,
      userType: driverType,
      payoutMethod,
      bankAccountNumber,
      bankIfscCode,
      bankAccountHolderName,
      upiVpa,
    });

    const { error: finalizeError } = await supabase.rpc(
      "verification_finalize_payout_v1",
      {
        p_actor_user_id: actorUserId,
        p_user_id: partnerUserId,
        p_razorpayx_contact_id: contactId,
        p_razorpayx_fund_account_id: fundAccountId,
      } as never,
    );

    if (finalizeError) {
      return {
        status: "pending_razorpayx",
        razorpayxContactId: contactId,
        razorpayxFundAccountId: fundAccountId,
        error: {
          code: finalizeError.code ?? "FINALIZE_RPC_FAILED",
          message: finalizeError.message ?? "Failed to finalize payout settings",
        },
      };
    }

    return {
      status: "active",
      razorpayxContactId: contactId,
      razorpayxFundAccountId: fundAccountId,
    };
  } catch (err) {
    if (err instanceof RazorpayXOnboardingError) {
      return {
        status: "pending_razorpayx",
        error: { code: err.code, message: err.message },
      };
    }
    return {
      status: "pending_razorpayx",
      error: {
        code: "UNKNOWN",
        message: err instanceof Error ? err.message : "Unknown RazorpayX error",
      },
    };
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as SubmitBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Request body is required" }, { status: 400 });
  }

  // Determine user type by checking which fields are present
  const isDriver = !!toStr(body.licenseNumber) || !!toStr(body.dlPhotoKey) || !!toStr(body.rcPhotoKey);
  const isTransporter = !!toStr(body.transportLicenseNumber) || !!toStr(body.licensePhotoKey);

  if (isDriver && isTransporter) {
    return NextResponse.json(
      { ok: false, message: "Cannot submit both driver and transporter fields" },
      { status: 400 },
    );
  }

  if (isDriver) {
    const licenseNumber = toStr(body.licenseNumber);
    const dlPhotoKey = toStr(body.dlPhotoKey);
    const aadharNumber = toStr(body.aadharNumber);
    const aadharPhotoKey = toStr(body.aadharPhotoKey);
    const registrationNumber = toStr(body.registrationNumber);
    const vehicleMasterTypeId = toStr(body.vehicleMasterTypeId);
    const rcPhotoKey = toStr(body.rcPhotoKey);
    const bankAccountNumber = toStr(body.bankAccountNumber);
    const bankIfscCode = toStr(body.bankIfscCode);
    const bankAccountHolderName = toStr(body.bankAccountHolderName);

    if (!licenseNumber || !aadharNumber ||
        !registrationNumber || !vehicleMasterTypeId ||
        !bankAccountNumber || !bankIfscCode || !bankAccountHolderName) {
      return NextResponse.json(
        { ok: false, message: "All mandatory driver verification fields are required" },
        { status: 400 },
      );
    }

    const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
      "verification_submit_driver_v1",
      {
        p_actor_user_id: actorResult.actor.id,
        p_user_id: userId,
        p_license_number: licenseNumber,
        p_license_expiry_date: toStr(body.licenseExpiryDate) || null,
        p_dl_photo_key: dlPhotoKey,
        p_aadhar_number: aadharNumber,
        p_aadhar_photo_key: aadharPhotoKey,
        p_registration_number: registrationNumber,
        p_vehicle_master_type_id: vehicleMasterTypeId,
        p_rc_photo_key: rcPhotoKey,
        p_bank_account_number: bankAccountNumber,
        p_bank_ifsc_code: bankIfscCode,
        p_bank_account_holder: bankAccountHolderName,
        p_upi_id: toStr(body.upiId),
        p_verification_notes: toStr(body.notes),
      } as never,
    );

    if (rpcError) {
      if (isMissingRpcError(rpcError)) {
        return NextResponse.json(
          { ok: false, message: "Missing RPC: verification_submit_driver_v1" },
          { status: 500 },
        );
      }
      return mapRpcError(rpcError.message ?? "Unable to submit driver verification", rpcError.code);
    }

    const result = (rpcData ?? null) as { user_id?: string; verified_at?: string } | null;
    const partnerUserId = result?.user_id ?? userId;
    const upiVpa = toStr(body.upiId);
    const payoutOnboarding = await onboardRazorpayX({
      supabase: actorResult.supabase,
      actorUserId: actorResult.actor.id,
      partnerUserId,
      driverType: "individual_driver",
      payoutMethod: upiVpa ? "upi" : "bank_account",
      bankAccountNumber,
      bankIfscCode,
      bankAccountHolderName,
      upiVpa,
    });

    return NextResponse.json({
      ok: true,
      data: {
        userId: partnerUserId,
        verifiedAt: result?.verified_at ?? new Date().toISOString(),
        payoutOnboarding,
      },
    });
  }

  // Transporter submission
  const transportLicenseNumber = toStr(body.transportLicenseNumber);
  const licensePhotoKey = toStr(body.licensePhotoKey);
  const aadharNumber = toStr(body.aadharNumber);
  const aadharPhotoKey = toStr(body.aadharPhotoKey);
  const bankAccountNumber = toStr(body.bankAccountNumber);
  const bankIfscCode = toStr(body.bankIfscCode);
  const bankAccountHolderName = toStr(body.bankAccountHolderName);

  if (!transportLicenseNumber || !aadharNumber ||
      !bankAccountNumber || !bankIfscCode || !bankAccountHolderName) {
    return NextResponse.json(
      { ok: false, message: "All mandatory transporter verification fields are required" },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "verification_submit_transporter_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_user_id: userId,
      p_transport_license_no: transportLicenseNumber,
      p_transport_license_exp: toStr(body.transportLicenseExpiry),
      p_license_photo_key: licensePhotoKey,
      p_aadhar_number: aadharNumber,
      p_aadhar_photo_key: aadharPhotoKey,
      p_bank_account_number: bankAccountNumber,
      p_bank_ifsc_code: bankIfscCode,
      p_bank_account_holder: bankAccountHolderName,
      p_upi_id: toStr(body.upiId),
      p_gst_number: toStr(body.gstNumber),
      p_pan_number: toStr(body.panNumber),
      p_verification_notes: toStr(body.notes),
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_submit_transporter_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to submit transporter verification", rpcError.code);
  }

  const result = (rpcData ?? null) as { user_id?: string; verified_at?: string } | null;
  const partnerUserId = result?.user_id ?? userId;
  const upiVpa = toStr(body.upiId);
  const payoutOnboarding = await onboardRazorpayX({
    supabase: actorResult.supabase,
    actorUserId: actorResult.actor.id,
    partnerUserId,
    driverType: "transporter",
    payoutMethod: upiVpa ? "upi" : "bank_account",
    bankAccountNumber,
    bankIfscCode,
    bankAccountHolderName,
    upiVpa,
  });
  return NextResponse.json({
    ok: true,
    data: {
      userId: partnerUserId,
      verifiedAt: result?.verified_at ?? new Date().toISOString(),
      payoutOnboarding,
    },
  });
}
