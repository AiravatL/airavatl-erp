import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

interface RawUpload {
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

interface RawEmployeeDriver {
  id: string;
  user_id: string;
  employee_id: string | null;
  full_name: string;
  phone: string;
  license_number: string | null;
  license_expiry_date: string | null;
  license_photo_url: string | null;
  aadhar_number: string | null;
  aadhar_photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  employment_start_date: string | null;
  employment_status: string | null;
  total_trips_completed: number | null;
  average_rating: number | null;
  is_documents_verified: boolean;
  verified_at: string | null;
  verification_notes: string | null;
  uploads?: Partial<Record<"dl" | "aadhaar", RawUpload | null>> | null;
  transporter: {
    id: string;
    user_id: string;
    full_name: string;
    organization_name: string | null;
    phone: string;
  };
}

function normalizeUpload(upload: RawUpload | null | undefined) {
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

function normalize(d: RawEmployeeDriver) {
  return {
    id: d.id,
    userId: d.user_id,
    employeeId: d.employee_id,
    fullName: d.full_name,
    phone: d.phone,
    licenseNumber: d.license_number,
    licenseExpiryDate: d.license_expiry_date,
    licensePhotoUrl: d.license_photo_url,
    aadharNumber: d.aadhar_number,
    aadharPhotoUrl: d.aadhar_photo_url,
    emergencyContactName: d.emergency_contact_name,
    emergencyContactPhone: d.emergency_contact_phone,
    employmentStartDate: d.employment_start_date,
    employmentStatus: d.employment_status,
    totalTripsCompleted: d.total_trips_completed ?? 0,
    averageRating: d.average_rating,
    isDocumentsVerified: d.is_documents_verified,
    verifiedAt: d.verified_at,
    verificationNotes: d.verification_notes,
    uploads: {
      dl: normalizeUpload(d.uploads?.dl),
      aadhaar: normalizeUpload(d.uploads?.aadhaar),
    },
    transporter: {
      id: d.transporter.id,
      userId: d.transporter.user_id,
      fullName: d.transporter.full_name,
      organizationName: d.transporter.organization_name,
      phone: d.transporter.phone,
    },
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { driverId } = await params;
  const { data, error } = await actorResult.supabase.rpc(
    "verification_get_employee_driver_v1",
    { p_employee_driver_id: driverId, p_actor_user_id: actorResult.actor.id } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_get_employee_driver_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to load driver", error.code);
  }
  const payload = data as { success: boolean; data?: RawEmployeeDriver } | null;
  if (!payload?.data) {
    return NextResponse.json({ ok: false, message: "Driver not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: normalize(payload.data) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { driverId } = await params;
  const body = (await request.json().catch(() => null)) as {
    licenseNumber?: string;
    licenseExpiryDate?: string;
    aadharNumber?: string;
    employeeId?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  } | null;

  const { data, error } = await actorResult.supabase.rpc(
    "verification_update_employee_driver_v1",
    {
      p_employee_driver_id: driverId,
      p_license_number: body?.licenseNumber ?? null,
      p_license_expiry_date: body?.licenseExpiryDate ?? null,
      p_aadhar_number: body?.aadharNumber ?? null,
      p_employee_id: body?.employeeId ?? null,
      p_emergency_contact_name: body?.emergencyContactName ?? null,
      p_emergency_contact_phone: body?.emergencyContactPhone ?? null,
      p_actor_user_id: actorResult.actor.id,
    } as never,
  );
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_update_employee_driver_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(error.message ?? "Unable to update driver", error.code);
  }
  return NextResponse.json({ ok: true, data });
}
