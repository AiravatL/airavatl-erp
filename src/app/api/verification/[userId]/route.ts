import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

interface UserRow {
  id: string;
  full_name: string;
  phone: string;
  user_type: string;
  city: string | null;
  state: string | null;
  is_verified: boolean;
  created_at: string;
}

interface DriverRow {
  id: string;
  license_number: string | null;
  license_expiry_date: string | null;
  license_photo_url: string | null;
  aadhar_number: string | null;
  aadhar_photo_url: string | null;
  bank_account_number: string | null;
  bank_ifsc_code: string | null;
  bank_account_holder_name: string | null;
  upi_id: string | null;
  is_documents_verified: boolean;
  verification_notes: string | null;
  verified_at: string | null;
  verified_by: string | null;
}

interface TransporterRow {
  id: string;
  organization_name: string;
  transport_license_number: string | null;
  transport_license_expiry: string | null;
  license_photo_url: string | null;
  aadhar_number: string | null;
  aadhar_photo_url: string | null;
  gst_number: string | null;
  pan_number: string | null;
  bank_account_number: string | null;
  bank_ifsc_code: string | null;
  bank_account_holder_name: string | null;
  upi_id: string | null;
  is_documents_verified: boolean;
  verification_notes: string | null;
  verified_at: string | null;
  verified_by: string | null;
}

interface VehicleRow {
  id: string;
  registration_number: string;
  registration_certificate_url: string | null;
  vehicle_master_type_id: string | null;
  vehicle_type: string | null;
  is_verified: boolean;
}

interface UploadRow {
  doc_type: "rc" | "dl" | "aadhaar" | "transport_license";
  status: "prepared" | "uploaded" | "attached" | "expired" | "missing";
  object_key: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_at: string | null;
  attached_at: string | null;
  source: "draft" | "final" | "none";
}

interface RpcResult {
  user: UserRow;
  driver: DriverRow | null;
  transporter: TransporterRow | null;
  vehicle: VehicleRow | null;
  uploads?: Partial<Record<UploadRow["doc_type"], UploadRow | null>> | null;
}

function normalizeDriver(d: DriverRow | null) {
  if (!d) return null;
  return {
    id: d.id,
    licenseNumber: d.license_number,
    licenseExpiryDate: d.license_expiry_date,
    licensePhotoUrl: d.license_photo_url,
    aadharNumber: d.aadhar_number,
    aadharPhotoUrl: d.aadhar_photo_url,
    bankAccountNumber: d.bank_account_number,
    bankIfscCode: d.bank_ifsc_code,
    bankAccountHolderName: d.bank_account_holder_name,
    upiId: d.upi_id,
    isDocumentsVerified: d.is_documents_verified,
    verificationNotes: d.verification_notes,
    verifiedAt: d.verified_at,
    verifiedBy: d.verified_by,
  };
}

function normalizeTransporter(t: TransporterRow | null) {
  if (!t) return null;
  return {
    id: t.id,
    organizationName: t.organization_name,
    transportLicenseNumber: t.transport_license_number,
    transportLicenseExpiry: t.transport_license_expiry,
    licensePhotoUrl: t.license_photo_url,
    aadharNumber: t.aadhar_number,
    aadharPhotoUrl: t.aadhar_photo_url,
    gstNumber: t.gst_number,
    panNumber: t.pan_number,
    bankAccountNumber: t.bank_account_number,
    bankIfscCode: t.bank_ifsc_code,
    bankAccountHolderName: t.bank_account_holder_name,
    upiId: t.upi_id,
    isDocumentsVerified: t.is_documents_verified,
    verificationNotes: t.verification_notes,
    verifiedAt: t.verified_at,
    verifiedBy: t.verified_by,
  };
}

function normalizeVehicle(v: VehicleRow | null) {
  if (!v) return null;
  return {
    id: v.id,
    registrationNumber: v.registration_number,
    registrationCertificateUrl: v.registration_certificate_url,
    vehicleMasterTypeId: v.vehicle_master_type_id,
    vehicleTypeLabel: v.vehicle_type,
    isVerified: v.is_verified,
  };
}

function normalizeUpload(upload: UploadRow | null | undefined) {
  if (!upload) return null;
  return {
    docType: upload.doc_type,
    status: upload.status,
    objectKey: upload.object_key,
    fileName: upload.file_name,
    mimeType: upload.mime_type,
    fileSizeBytes: upload.file_size_bytes,
    uploadedAt: upload.uploaded_at,
    attachedAt: upload.attached_at,
    source: upload.source,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "verification_get_details_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_user_id: userId,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_get_details_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch partner details", rpcError.code);
  }

  const result = (rpcData ?? null) as RpcResult | null;
  if (!result?.user) {
    return NextResponse.json({ ok: false, message: "Partner not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      user: {
        id: result.user.id,
        fullName: result.user.full_name,
        phone: result.user.phone,
        userType: result.user.user_type,
        city: result.user.city,
        state: result.user.state,
        isVerified: result.user.is_verified,
        createdAt: result.user.created_at,
      },
      driver: normalizeDriver(result.driver),
      transporter: normalizeTransporter(result.transporter),
      vehicle: normalizeVehicle(result.vehicle),
      uploads: {
        rc: normalizeUpload(result.uploads?.rc),
        dl: normalizeUpload(result.uploads?.dl),
        aadhaar: normalizeUpload(result.uploads?.aadhaar),
        transport_license: normalizeUpload(result.uploads?.transport_license),
      },
    },
  });
}
