import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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
  alreadyOnboarded?: boolean;
  error?: { code: string; message: string };
}

/**
 * After the verification RPC writes the partner row in `pending_razorpayx`
 * state (and stamps `driver_payout_settings` with bank/UPI), invoke the
 * Supabase edge function `admin-onboard-driver-payout` to create the
 * RazorpayX Contact + Fund Account and finalize the DPS row.
 *
 * We invoke the edge function (instead of calling RazorpayX HTTP from this
 * server) so the RazorpayX secrets only need to live in Supabase env, not
 * in the Next.js runtime. This is also the exact path the retry endpoint
 * uses, so a manual retry behaves identically to the auto-chain.
 *
 * Failures here leave the row in `pending_razorpayx`; the admin can retry
 * from the verification page without losing the verified KYC state.
 */
async function onboardRazorpayX(opts: {
  partnerUserId: string;
  actorUserId: string;
  driverType: "individual_driver" | "transporter";
}): Promise<PayoutOnboardingResult> {
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return {
      status: "pending_razorpayx",
      error: {
        code: "ADMIN_CLIENT_UNAVAILABLE",
        message: "Service role client not configured",
      },
    };
  }

  type EdgeResponse = {
    ok: boolean;
    error?: string;
    razorpayxContactId?: string;
    razorpayxFundAccountId?: string;
    alreadyOnboarded?: boolean;
  };

  const { data, error } = await adminClient.functions.invoke<EdgeResponse>(
    "admin-onboard-driver-payout",
    {
      body: {
        userId: opts.partnerUserId,
        actorUserId: opts.actorUserId,
        driverType: opts.driverType,
      },
    },
  );

  if (error) {
    // Supabase wraps non-2xx responses as FunctionsHttpError; the body lives
    // on error.context. Pull it for a useful message.
    let bodyMessage: string | null = null;
    type EdgeErrorWithContext = { context?: { text?: () => Promise<string> } };
    const ctx = (error as unknown as EdgeErrorWithContext).context;
    if (ctx?.text) {
      try {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw) as Partial<EdgeResponse>;
          bodyMessage = parsed.error ?? raw;
        } catch {
          bodyMessage = raw;
        }
      } catch {
        // ignore — fall back to error.message
      }
    }
    return {
      status: "pending_razorpayx",
      error: {
        code: "EDGE_FUNCTION_FAILED",
        message: bodyMessage ?? error.message ?? "Edge function call failed",
      },
    };
  }

  if (!data?.ok) {
    return {
      status: "pending_razorpayx",
      razorpayxContactId: data?.razorpayxContactId,
      razorpayxFundAccountId: data?.razorpayxFundAccountId,
      error: {
        code: "RAZORPAYX_FAILED",
        message: data?.error ?? "RazorpayX onboarding failed",
      },
    };
  }

  return {
    status: "active",
    razorpayxContactId: data.razorpayxContactId,
    razorpayxFundAccountId: data.razorpayxFundAccountId,
    alreadyOnboarded: data.alreadyOnboarded,
  };
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
    const payoutOnboarding = await onboardRazorpayX({
      partnerUserId,
      actorUserId: actorResult.actor.id,
      driverType: "individual_driver",
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
  const payoutOnboarding = await onboardRazorpayX({
    partnerUserId,
    actorUserId: actorResult.actor.id,
    driverType: "transporter",
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
