import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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

// ---------------------------------------------------------------------------
// DELETE /api/verification/[userId]
// Hard-delete an unverified partner so the phone is freed for a fresh signup.
// super_admin / admin only. Refuses if the user has any auction/trip activity.
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 });
  }
  if (userId === actorResult.actor.id) {
    return NextResponse.json(
      { ok: false, message: "You cannot delete your own account from here." },
      { status: 400 },
    );
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "Service role client not configured" },
      { status: 500 },
    );
  }

  const { data: profileRaw } = await adminClient
    .from("user_profiles")
    .select("id, full_name, phone, user_type, is_verified")
    .eq("id", userId)
    .maybeSingle();

  const profile = profileRaw as
    | { id: string; full_name: string; phone: string | null; user_type: string; is_verified: boolean }
    | null;

  if (!profile) {
    return NextResponse.json({ ok: false, message: "Partner not found" }, { status: 404 });
  }
  if (profile.is_verified) {
    return NextResponse.json(
      { ok: false, message: "Cannot delete a verified partner. Revoke verification first." },
      { status: 400 },
    );
  }

  // IMPORTANT mapping: auction_bids.bidder_id and trips.driver_id /
  // delivery_requests.consigner_id reference the partner's ROLE-SPECIFIC row id
  // (individual_drivers.id / transporters.id / consigners.id) — NOT
  // user_profiles.id. Checking them against userId silently misses all activity
  // and previously let deletes orphan bids on live auctions. Resolve the
  // role-specific ids first, then guard against them.
  const [driverRow, transporterRow, consignerRow] = await Promise.all([
    adminClient.from("individual_drivers").select("id").eq("user_id", userId).maybeSingle(),
    adminClient.from("transporters").select("id").eq("user_id", userId).maybeSingle(),
    adminClient.from("consigners").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  const driverId = (driverRow.data as { id: string } | null)?.id ?? null;
  const transporterId = (transporterRow.data as { id: string } | null)?.id ?? null;
  const consignerId = (consignerRow.data as { id: string } | null)?.id ?? null;
  const bidderIds = [driverId, transporterId].filter(Boolean) as string[];

  // Build the trips OR-filter only from the ids that actually exist.
  const tripOrParts: string[] = [];
  if (bidderIds.length) {
    const list = `(${bidderIds.join(",")})`;
    tripOrParts.push(`driver_id.in.${list}`, `assigned_driver_id.in.${list}`);
  }
  if (consignerId) tripOrParts.push(`consigner_id.eq.${consignerId}`);

  const ZERO = Promise.resolve({ count: 0 } as { count: number | null });
  const [bids, trips, payments, deliveries] = await Promise.all([
    bidderIds.length
      ? adminClient.from("auction_bids").select("id", { count: "exact", head: true }).in("bidder_id", bidderIds)
      : ZERO,
    tripOrParts.length
      ? adminClient.from("trips").select("id", { count: "exact", head: true }).or(tripOrParts.join(","))
      : ZERO,
    adminClient.from("trip_driver_payments").select("id", { count: "exact", head: true }).eq("driver_user_id", userId),
    consignerId
      ? adminClient.from("delivery_requests").select("id", { count: "exact", head: true }).eq("consigner_id", consignerId)
      : ZERO,
  ]);
  if (
    (bids.count ?? 0) > 0 ||
    (trips.count ?? 0) > 0 ||
    (payments.count ?? 0) > 0 ||
    (deliveries.count ?? 0) > 0
  ) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Cannot delete: partner has bids, trips, deliveries, or payments on record. " +
          "Resolve those (e.g. via Operations) before deleting.",
      },
      { status: 400 },
    );
  }

  // Best-effort manual cleanup for tables without an FK to user_profiles.
  // user_profiles cascade covers transporters / individual_drivers / employee_drivers /
  // consigners / app_notifications / push_notification_queue.
  await adminClient.from("driver_payout_settings").delete().eq("user_id", userId);
  await adminClient.from("driver_locations").delete().eq("driver_id", userId);
  await adminClient.from("driver_availability").delete().eq("driver_id", userId);
  if (profile.phone) {
    await adminClient.from("user_blocklist").delete().or(`user_id.eq.${userId},phone_number.eq.${profile.phone}`);
  } else {
    await adminClient.from("user_blocklist").delete().eq("user_id", userId);
  }

  // Drop the profile row (cascades to type tables + notifications).
  const { error: profileDelErr } = await adminClient
    .from("user_profiles")
    .delete()
    .eq("id", userId);
  if (profileDelErr) {
    return NextResponse.json(
      { ok: false, message: profileDelErr.message ?? "Failed to delete profile" },
      { status: 500 },
    );
  }

  // Delete the auth user so the phone is freed for a fresh signup.
  const { error: authDelErr } = await adminClient.auth.admin.deleteUser(userId);
  if (authDelErr) {
    // Profile is already gone — surface the auth error but don't 500 the call.
    return NextResponse.json(
      {
        ok: true,
        data: {
          userId,
          warning: `Profile deleted but auth user removal failed: ${authDelErr.message}. Run cleanup manually.`,
        },
      },
      { status: 200 },
    );
  }

  // Best-effort audit
  try {
    await adminClient.rpc("audit_log_insert", {
      p_action: "partner_deleted",
      p_entity_schema: "public",
      p_entity_table: "user_profiles",
      p_entity_id: userId,
      p_old_values: profile,
      p_new_values: null,
    } as never);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, data: { userId } });
}
