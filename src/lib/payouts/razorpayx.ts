/**
 * RazorpayX onboarding helper.
 *
 * Called from the ERP verification flow (and the retry endpoint) to
 * create a RazorpayX Contact + Fund Account for a partner. The IDs
 * returned here are then handed to `erp.verification_finalize_payout_v1`
 * which writes them to `driver_payout_settings` and flips
 * `is_validated=true`.
 *
 * This module only does HTTP — no Supabase, no DB. The caller is
 * responsible for persisting the IDs and reacting to errors.
 */

const RAZORPAYX_BASE_URL = "https://api.razorpay.com/v1";

export type DriverType = "individual_driver" | "transporter";
export type PayoutMethod = "bank_account" | "upi";

export interface CreateDriverFundAccountInput {
  userId: string;
  fullName: string;
  phone: string;
  userType: DriverType;
  payoutMethod: PayoutMethod;
  // For payoutMethod === 'bank_account'
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
  // For payoutMethod === 'upi'
  upiVpa?: string | null;
}

export interface CreateDriverFundAccountResult {
  contactId: string;
  fundAccountId: string;
}

export class RazorpayXOnboardingError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body: unknown;
  constructor(opts: { message: string; code: string; status: number; body: unknown }) {
    super(opts.message);
    this.name = "RazorpayXOnboardingError";
    this.code = opts.code;
    this.status = opts.status;
    this.body = opts.body;
  }
}

interface RazorpayXAuth {
  keyId: string;
  keySecret: string;
}

function readAuth(): RazorpayXAuth {
  const keyId = (process.env.RAZORPAYX_KEY_ID ?? "").trim();
  const keySecret = (process.env.RAZORPAYX_KEY_SECRET ?? "").trim();
  if (!keyId || !keySecret) {
    throw new RazorpayXOnboardingError({
      message: "RazorpayX credentials not configured (RAZORPAYX_KEY_ID / RAZORPAYX_KEY_SECRET).",
      code: "RAZORPAYX_NOT_CONFIGURED",
      status: 500,
      body: null,
    });
  }
  return { keyId, keySecret };
}

async function razorpayXFetch(
  endpoint: string,
  body: Record<string, unknown>,
  auth: RazorpayXAuth,
): Promise<Record<string, unknown>> {
  const basic = Buffer.from(`${auth.keyId}:${auth.keySecret}`).toString("base64");
  const response = await fetch(`${RAZORPAYX_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // ignore — we'll surface the status
  }
  if (!response.ok) {
    const data = (parsed ?? {}) as { error?: { description?: string; code?: string } };
    throw new RazorpayXOnboardingError({
      message: data.error?.description ?? `RazorpayX ${endpoint} failed (${response.status})`,
      code: data.error?.code ?? `HTTP_${response.status}`,
      status: response.status,
      body: parsed,
    });
  }
  return (parsed ?? {}) as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Create a RazorpayX Contact (if needed) and a Fund Account, returning
 * both IDs. This is the only RazorpayX-side write performed during
 * driver verification.
 */
export async function createDriverFundAccount(
  input: CreateDriverFundAccountInput,
): Promise<CreateDriverFundAccountResult> {
  const auth = readAuth();

  const fullName = input.fullName.trim();
  if (!fullName) {
    throw new RazorpayXOnboardingError({
      message: "Driver full name is required to create RazorpayX contact",
      code: "MISSING_NAME",
      status: 400,
      body: null,
    });
  }

  const contactPayload: Record<string, unknown> = {
    name: fullName,
    contact: input.phone,
    type: "vendor",
    reference_id: input.userId,
    notes: { user_type: input.userType },
  };
  const contactResponse = await razorpayXFetch("/contacts", contactPayload, auth);
  const contactId = asString(contactResponse["id"]);
  if (!contactId) {
    throw new RazorpayXOnboardingError({
      message: "RazorpayX /contacts response missing id",
      code: "CONTACT_RESPONSE_INVALID",
      status: 502,
      body: contactResponse,
    });
  }

  let fundAccountPayload: Record<string, unknown>;
  if (input.payoutMethod === "bank_account") {
    if (!input.bankAccountNumber || !input.bankIfscCode || !input.bankAccountHolderName) {
      throw new RazorpayXOnboardingError({
        message: "Bank account details are incomplete",
        code: "INCOMPLETE_BANK_DETAILS",
        status: 400,
        body: null,
      });
    }
    fundAccountPayload = {
      contact_id: contactId,
      account_type: "bank_account",
      bank_account: {
        name: input.bankAccountHolderName,
        ifsc: input.bankIfscCode,
        account_number: input.bankAccountNumber,
      },
    };
  } else {
    if (!input.upiVpa) {
      throw new RazorpayXOnboardingError({
        message: "UPI VPA is required for UPI payout method",
        code: "MISSING_UPI_VPA",
        status: 400,
        body: null,
      });
    }
    fundAccountPayload = {
      contact_id: contactId,
      account_type: "vpa",
      vpa: { address: input.upiVpa },
    };
  }

  const fundResponse = await razorpayXFetch("/fund_accounts", fundAccountPayload, auth);
  const fundAccountId = asString(fundResponse["id"]);
  if (!fundAccountId) {
    throw new RazorpayXOnboardingError({
      message: "RazorpayX /fund_accounts response missing id",
      code: "FUND_ACCOUNT_RESPONSE_INVALID",
      status: 502,
      body: fundResponse,
    });
  }

  return { contactId, fundAccountId };
}
