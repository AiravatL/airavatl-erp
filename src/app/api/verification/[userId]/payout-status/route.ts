import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 });
  }

  // ?reveal=1 returns the full bank_account_number — only super_admin/admin
  // are allowed to see the full number (they need it to prefill the edit form).
  const url = new URL(request.url);
  const wantsReveal = url.searchParams.get("reveal") === "1";
  const canReveal =
    wantsReveal &&
    (actorResult.actor.role === "super_admin" || actorResult.actor.role === "admin");

  // driver_payout_settings RLS only allows users to read their own row, so we
  // read with the service-role client for admin views.
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
      "user_id, driver_type, payout_method, bank_account_holder_name, bank_account_number, bank_ifsc_code, bank_name, upi_vpa, upi_verified, razorpayx_contact_id, razorpayx_fund_account_id, razorpayx_bank_fund_account_id, razorpayx_upi_fund_account_id, is_validated, validation_status, created_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message ?? "Unable to load payout status" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({
      ok: true,
      data: {
        hasSettings: false,
        status: "missing" as const,
      },
    });
  }

  const row = data as {
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
    razorpayx_bank_fund_account_id: string | null;
    razorpayx_upi_fund_account_id: string | null;
    is_validated: boolean | null;
    validation_status: string | null;
    created_at: string;
    updated_at: string;
  };

  // "active" means the partner has at least one rail fully onboarded. The
  // legacy razorpayx_fund_account_id mirrors the primary rail (per
  // payout_method); per-rail flags below tell the UI which rails are linked.
  const status: "active" | "pending_razorpayx" =
    row.is_validated && row.razorpayx_contact_id && row.razorpayx_fund_account_id
      ? "active"
      : "pending_razorpayx";

  return NextResponse.json({
    ok: true,
    data: {
      hasSettings: true,
      status,
      driverType: row.driver_type,
      payoutMethod: row.payout_method,
      bankAccountHolderName: row.bank_account_holder_name,
      bankAccountNumber: canReveal ? row.bank_account_number : null,
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
      razorpayxBankFundAccountId: row.razorpayx_bank_fund_account_id,
      razorpayxUpiFundAccountId: row.razorpayx_upi_fund_account_id,
      isValidated: row.is_validated,
      validationStatus: row.validation_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}
