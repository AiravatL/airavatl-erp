import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Retry RazorpayX onboarding for a verified partner. We delegate the actual
// RazorpayX API calls + DPS finalize to the `admin-onboard-driver-payout`
// edge function so the secrets (RAZORPAYX_KEY_ID/SECRET) only live in
// Supabase, not in the ERP server's env.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 });
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "Service role client not configured" },
      { status: 500 },
    );
  }

  // Fast idempotency check: if already onboarded, skip the edge function call.
  type SettingsRow = {
    is_validated: boolean | null;
    razorpayx_contact_id: string | null;
    razorpayx_fund_account_id: string | null;
  };
  const { data: existingData } = await adminClient
    .from("driver_payout_settings")
    .select("is_validated, razorpayx_contact_id, razorpayx_fund_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  const existing = existingData as unknown as SettingsRow | null;

  if (
    existing?.is_validated &&
    existing.razorpayx_contact_id &&
    existing.razorpayx_fund_account_id
  ) {
    return NextResponse.json({
      ok: true,
      data: {
        payoutOnboarding: {
          status: "active",
          razorpayxContactId: existing.razorpayx_contact_id,
          razorpayxFundAccountId: existing.razorpayx_fund_account_id,
          alreadyOnboarded: true,
        },
      },
    });
  }

  // Invoke the edge function — it has the RazorpayX secrets, calls the
  // RazorpayX /contacts + /fund_accounts APIs, and finalizes via the
  // erp.verification_finalize_payout_v1 RPC.
  type EdgeResponse = {
    ok: boolean;
    error?: string;
    razorpayxContactId?: string;
    razorpayxFundAccountId?: string;
    alreadyOnboarded?: boolean;
    note?: string;
  };
  const { data, error } = await adminClient.functions.invoke<EdgeResponse>(
    "admin-onboard-driver-payout",
    { body: { userId, actorUserId: actorResult.actor.id } },
  );

  if (error) {
    // Supabase wraps non-2xx responses as FunctionsHttpError. The actual error
    // body is on error.context (a Response). Extract it for a useful message.
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
    const message = bodyMessage ?? error.message ?? "Edge function call failed";
    return NextResponse.json(
      {
        ok: false,
        message,
        data: {
          payoutOnboarding: {
            status: "pending_razorpayx",
            error: { code: "EDGE_FUNCTION_FAILED", message },
          },
        },
      },
      { status: 502 },
    );
  }

  if (!data?.ok) {
    const message = data?.error ?? "RazorpayX onboarding failed";
    return NextResponse.json(
      {
        ok: false,
        message,
        data: {
          payoutOnboarding: {
            status: "pending_razorpayx",
            razorpayxContactId: data?.razorpayxContactId,
            razorpayxFundAccountId: data?.razorpayxFundAccountId,
            error: { code: "RAZORPAYX_FAILED", message },
          },
        },
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      payoutOnboarding: {
        status: "active",
        razorpayxContactId: data.razorpayxContactId,
        razorpayxFundAccountId: data.razorpayxFundAccountId,
        alreadyOnboarded: data.alreadyOnboarded,
      },
    },
  });
}
