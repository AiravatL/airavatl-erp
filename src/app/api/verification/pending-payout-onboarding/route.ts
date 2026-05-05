import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  // driver_payout_settings RLS restricts reads to the owning user, so the
  // admin views fetch via the service-role client.
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "Service role client not configured" },
      { status: 500 },
    );
  }

  const { data, error } = await adminClient
    .from("driver_payout_settings")
    .select(
      `
      user_id,
      driver_type,
      payout_method,
      bank_account_holder_name,
      bank_account_number,
      bank_ifsc_code,
      bank_name,
      upi_vpa,
      upi_verified,
      razorpayx_contact_id,
      razorpayx_fund_account_id,
      is_validated,
      validation_status,
      created_at,
      updated_at,
      user_profiles!inner (
        id,
        full_name,
        phone,
        user_type,
        is_verified,
        city,
        state
      )
      `,
    )
    .eq("user_profiles.is_verified", true)
    .is("razorpayx_fund_account_id", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message ?? "Unable to load partners pending payout onboarding" },
      { status: 500 },
    );
  }

  type Row = {
    user_id: string;
    driver_type: string | null;
    payout_method: string | null;
    bank_account_holder_name: string | null;
    bank_account_number: string | null;
    bank_ifsc_code: string | null;
    bank_name: string | null;
    upi_vpa: string | null;
    upi_verified: boolean | null;
    razorpayx_contact_id: string | null;
    razorpayx_fund_account_id: string | null;
    is_validated: boolean | null;
    validation_status: string | null;
    created_at: string;
    updated_at: string;
    user_profiles: {
      id: string;
      full_name: string | null;
      phone: string | null;
      user_type: string;
      is_verified: boolean | null;
      city: string | null;
      state: string | null;
    } | null;
  };

  const rows = (data as unknown as Row[] | null) ?? [];
  const items = rows.map((row) => ({
    userId: row.user_id,
    fullName: row.user_profiles?.full_name ?? "",
    phone: row.user_profiles?.phone ?? "",
    userType: row.user_profiles?.user_type ?? "",
    city: row.user_profiles?.city ?? null,
    state: row.user_profiles?.state ?? null,
    driverType: row.driver_type,
    payoutMethod: row.payout_method,
    bankAccountHolderName: row.bank_account_holder_name,
    bankAccountNumberLast4:
      row.bank_account_number && row.bank_account_number.length > 4
        ? row.bank_account_number.slice(-4)
        : null,
    bankIfscCode: row.bank_ifsc_code,
    bankName: row.bank_name,
    upiVpa: row.upi_vpa,
    upiVerified: row.upi_verified,
    razorpayxContactId: row.razorpayx_contact_id,
    razorpayxFundAccountId: row.razorpayx_fund_account_id,
    isValidated: row.is_validated,
    validationStatus: row.validation_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({ ok: true, data: { items, total: items.length } });
}
