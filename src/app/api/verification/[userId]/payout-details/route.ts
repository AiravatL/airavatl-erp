import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const BANK_ACCT_RE = /^[0-9]{8,18}$/;
const UPI_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z][a-zA-Z0-9.-]+$/;

interface PayoutInput {
  // Optional preference. When omitted, derived from which rails are present
  // (bank wins if both, matching the legacy submit-RPC default).
  payoutMethod?: "bank_account" | "upi";
  bankAccountHolderName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankName?: string | null;
  upiVpa?: string | null;
}

interface ValidatedPayout {
  payoutMethod: "bank_account" | "upi";
  bankAccountHolderName: string | null;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  bankName: string | null;
  upiVpa: string | null;
  hasBank: boolean;
  hasUpi: boolean;
}

function validate(body: unknown): { ok: true; data: ValidatedPayout } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid body" };
  const b = body as Record<string, unknown> & PayoutInput;

  const method = b.payoutMethod;
  if (method !== undefined && method !== "bank_account" && method !== "upi") {
    return { ok: false, message: "payoutMethod, when set, must be 'bank_account' or 'upi'" };
  }

  const holder = typeof b.bankAccountHolderName === "string" ? b.bankAccountHolderName.trim() : null;
  const acct = typeof b.bankAccountNumber === "string" ? b.bankAccountNumber.trim() : null;
  const ifsc = typeof b.bankIfscCode === "string" ? b.bankIfscCode.trim().toUpperCase() : null;
  const bankName = typeof b.bankName === "string" ? b.bankName.trim() : null;
  const upi = typeof b.upiVpa === "string" ? b.upiVpa.trim() : null;

  // A "complete" rail is one where every required field is provided. We allow
  // either or both rails as long as at least one is complete.
  const bankProvidedAny = !!(holder || acct || ifsc);
  if (bankProvidedAny) {
    if (!holder || holder.length < 1 || holder.length > 100) {
      return { ok: false, message: "bankAccountHolderName: required (1-100 chars) when bank fields are provided" };
    }
    if (!acct || !BANK_ACCT_RE.test(acct)) {
      return { ok: false, message: "bankAccountNumber: must be 8-18 digits" };
    }
    if (!ifsc || !IFSC_RE.test(ifsc)) {
      return { ok: false, message: "bankIfscCode: invalid IFSC format" };
    }
  }

  if (upi && !UPI_RE.test(upi)) {
    return { ok: false, message: "upiVpa: must be a valid UPI VPA (e.g. name@bank)" };
  }

  const hasBank = !!(holder && acct && ifsc);
  const hasUpi = !!upi;
  if (!hasBank && !hasUpi) {
    return { ok: false, message: "Provide bank details, UPI, or both" };
  }

  // If method is supplied, it must match a rail that's actually present.
  if (method === "bank_account" && !hasBank) {
    return { ok: false, message: "payoutMethod=bank_account but bank details are incomplete" };
  }
  if (method === "upi" && !hasUpi) {
    return { ok: false, message: "payoutMethod=upi but no UPI VPA provided" };
  }

  // Derive preferred method when not supplied: bank wins if both available
  // (matches the legacy submit-RPC behaviour where bank was the default).
  const resolvedMethod: "bank_account" | "upi" = method ?? (hasBank ? "bank_account" : "upi");

  return {
    ok: true,
    data: {
      payoutMethod: resolvedMethod,
      bankAccountHolderName: hasBank ? holder : null,
      bankAccountNumber: hasBank ? acct : null,
      bankIfscCode: hasBank ? ifsc : null,
      bankName: hasBank ? bankName : null,
      upiVpa: hasUpi ? upi : null,
      hasBank,
      hasUpi,
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
  // ALL razorpayx_* fund-account columns so a subsequent Retry creates fresh
  // accounts on a fresh contact (and doesn't leak stale per-rail IDs).
  const updates = {
    payout_method: input.payoutMethod,
    bank_account_holder_name: input.bankAccountHolderName,
    bank_account_number: input.bankAccountNumber,
    bank_ifsc_code: input.bankIfscCode,
    bank_name: input.bankName,
    upi_vpa: input.upiVpa,
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
        has_bank: input.hasBank,
        has_upi: input.hasUpi,
      },
    } as never);
  } catch {
    // best-effort: do not fail the request if audit logging hiccups
  }

  return NextResponse.json({ ok: true, data: { userId } });
}
