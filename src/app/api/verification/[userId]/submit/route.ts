import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

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
    return NextResponse.json({
      ok: true,
      data: { userId: result?.user_id ?? userId, verifiedAt: result?.verified_at ?? new Date().toISOString() },
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
  return NextResponse.json({
    ok: true,
    data: { userId: result?.user_id ?? userId, verifiedAt: result?.verified_at ?? new Date().toISOString() },
  });
}
