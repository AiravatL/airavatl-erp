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

  // Look up the partner's current user_type so the DPS lookup can filter by
  // (user_id, driver_type) — DPS uniqueness is on that pair, so a partner who
  // was ever swapped between roles could in principle have two rows.
  type ProfileRow = { user_type: string | null };
  const { data: profileData } = await adminClient
    .from("user_profiles")
    .select("user_type")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileData as unknown as ProfileRow | null;
  const driverType = profile?.user_type;
  if (driverType !== "individual_driver" && driverType !== "transporter") {
    return NextResponse.json(
      { ok: false, message: "Partner is not a driver or transporter" },
      { status: 400 },
    );
  }

  // No fast-skip here. With the dual-rail design (bank + UPI), we can't tell
  // from this layer whether all wanted rails are onboarded — only the edge
  // function has the per-rail truth. The edge function is itself idempotent
  // (reuses contacts by reference_id, dedupes fund accounts by IFSC/VPA), so
  // an extra invocation for an already-onboarded partner is a no-op.

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
    { body: { userId, actorUserId: actorResult.actor.id, driverType } },
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
