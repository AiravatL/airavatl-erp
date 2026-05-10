import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const BANK_ACCT_RE = /^[0-9]{8,18}$/;
const UPI_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z][a-zA-Z0-9.-]+$/;

interface PayoutInput {
  payoutMethod: "bank_account" | "upi";
  bankAccountHolderName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankName?: string | null;
  upiVpa?: string | null;
}

function validate(body: unknown): { ok: true; data: PayoutInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid body" };
  const b = body as Record<string, unknown>;
  const method = b.payoutMethod;
  if (method !== "bank_account" && method !== "upi") {
    return { ok: false, message: "payoutMethod must be 'bank_account' or 'upi'" };
  }

  const holder = typeof b.bankAccountHolderName === "string" ? b.bankAccountHolderName.trim() : null;
  const acct = typeof b.bankAccountNumber === "string" ? b.bankAccountNumber.trim() : null;
  const ifsc = typeof b.bankIfscCode === "string" ? b.bankIfscCode.trim().toUpperCase() : null;
  const bankName = typeof b.bankName === "string" ? b.bankName.trim() : null;
  const upi = typeof b.upiVpa === "string" ? b.upiVpa.trim() : null;

  if (method === "bank_account") {
    if (!holder || holder.length < 1 || holder.length > 100) {
      return { ok: false, message: "bankAccountHolderName: required (1-100 chars)" };
    }
    if (!acct || !BANK_ACCT_RE.test(acct)) {
      return { ok: false, message: "bankAccountNumber: must be 8-18 digits" };
    }
    if (!ifsc || !IFSC_RE.test(ifsc)) {
      return { ok: false, message: "bankIfscCode: invalid IFSC format" };
    }
  } else {
    if (!upi || !UPI_RE.test(upi)) {
      return { ok: false, message: "upiVpa: must be a valid UPI VPA (e.g. name@bank)" };
    }
  }

  return {
    ok: true,
    data: {
      payoutMethod: method,
      bankAccountHolderName: holder,
      bankAccountNumber: acct,
      bankIfscCode: ifsc,
      bankName,
      upiVpa: upi,
    },
  };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  // Only super_admin and admin can edit payout details (sales_vehicles can verify but not edit bank info).
  const actorResult = await requireVerificationActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validate(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
  }
  const input = parsed.data;

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "Service role client not configured" },
      { status: 500 },
    );
  }

  // Updating bank/UPI invalidates the existing RazorpayX onboarding — clear
  // those IDs so a subsequent Retry creates a fresh contact + fund account.
  const updates = {
    payout_method: input.payoutMethod,
    bank_account_holder_name: input.payoutMethod === "bank_account" ? input.bankAccountHolderName : null,
    bank_account_number: input.payoutMethod === "bank_account" ? input.bankAccountNumber : null,
    bank_ifsc_code: input.payoutMethod === "bank_account" ? input.bankIfscCode : null,
    bank_name: input.payoutMethod === "bank_account" ? input.bankName ?? null : null,
    upi_vpa: input.payoutMethod === "upi" ? input.upiVpa : null,
    upi_verified: false,
    upi_verified_at: null,
    razorpayx_contact_id: null,
    razorpayx_fund_account_id: null,
    razorpayx_bank_fund_account_id: null,
    razorpayx_upi_fund_account_id: null,
    is_validated: false,
    validation_status: "pending",
  };

  const { data: existing } = await adminClient
    .from("driver_payout_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { ok: false, message: "No payout settings row exists. Run verification first." },
      { status: 404 },
    );
  }

  const { error: updateError } = await adminClient
    .from("driver_payout_settings")
    .update(updates as never)
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json(
      { ok: false, message: updateError.message ?? "Failed to update payout details" },
      { status: 500 },
    );
  }

  // Best-effort audit log via service role.
  try {
    await adminClient.rpc("audit_log_insert", {
      p_action: "payout_details_updated",
      p_entity_schema: "public",
      p_entity_table: "driver_payout_settings",
      p_entity_id: userId,
      p_old_values: {},
      p_new_values: {
        payout_method: input.payoutMethod,
        has_bank: !!input.bankAccountNumber,
        has_upi: !!input.upiVpa,
      },
    } as never);
  } catch {
    // best-effort: do not fail the request if audit logging hiccups
  }

  return NextResponse.json({ ok: true, data: { userId } });
}
