import { NextResponse } from "next/server";
import {
  createDriverFundAccount,
  RazorpayXOnboardingError,
  type DriverType,
  type PayoutMethod,
} from "@/lib/payouts/razorpayx";
import { requireVerificationActor } from "@/app/api/verification/_shared";

export const dynamic = "force-dynamic";

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

  // Pull the existing payout-settings row plus the partner's name/phone
  // so we can call RazorpayX. We don't accept any body — this endpoint
  // is just a re-run of the onboarding step against whatever the
  // verification RPC last wrote.
  const { data: settings, error: settingsError } = await actorResult.supabase
    .from("driver_payout_settings")
    .select(
      "user_id, driver_type, payout_method, bank_account_number, bank_ifsc_code, bank_account_holder_name, upi_vpa, is_validated, validation_status, razorpayx_contact_id, razorpayx_fund_account_id",
    )
    .eq("user_id", userId)
    .single();

  if (settingsError || !settings) {
    return NextResponse.json(
      {
        ok: false,
        message: "No payout settings found for this partner. Run verification first.",
      },
      { status: 404 },
    );
  }

  // Idempotent: already onboarded.
  if (
    settings.is_validated &&
    settings.razorpayx_contact_id &&
    settings.razorpayx_fund_account_id
  ) {
    return NextResponse.json({
      ok: true,
      data: {
        payoutOnboarding: {
          status: "active",
          razorpayxContactId: settings.razorpayx_contact_id,
          razorpayxFundAccountId: settings.razorpayx_fund_account_id,
          alreadyOnboarded: true,
        },
      },
    });
  }

  const { data: profile, error: profileError } = await actorResult.supabase
    .from("user_profiles")
    .select("full_name, phone")
    .eq("id", userId)
    .single();

  if (profileError || !profile?.full_name || !profile?.phone) {
    return NextResponse.json(
      {
        ok: false,
        message: profileError?.message ?? "Could not load partner profile",
      },
      { status: 400 },
    );
  }

  try {
    const { contactId, fundAccountId } = await createDriverFundAccount({
      userId,
      fullName: profile.full_name,
      phone: profile.phone,
      userType: settings.driver_type as DriverType,
      payoutMethod: settings.payout_method as PayoutMethod,
      bankAccountNumber: settings.bank_account_number,
      bankIfscCode: settings.bank_ifsc_code,
      bankAccountHolderName: settings.bank_account_holder_name,
      upiVpa: settings.upi_vpa,
    });

    const { error: finalizeError } = await actorResult.supabase.rpc(
      "verification_finalize_payout_v1",
      {
        p_actor_user_id: actorResult.actor.id,
        p_user_id: userId,
        p_razorpayx_contact_id: contactId,
        p_razorpayx_fund_account_id: fundAccountId,
      } as never,
    );

    if (finalizeError) {
      return NextResponse.json(
        {
          ok: false,
          message: finalizeError.message ?? "Failed to finalize payout settings",
          data: {
            payoutOnboarding: {
              status: "pending_razorpayx",
              razorpayxContactId: contactId,
              razorpayxFundAccountId: fundAccountId,
              error: { code: "FINALIZE_RPC_FAILED", message: finalizeError.message },
            },
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        payoutOnboarding: {
          status: "active",
          razorpayxContactId: contactId,
          razorpayxFundAccountId: fundAccountId,
        },
      },
    });
  } catch (err) {
    if (err instanceof RazorpayXOnboardingError) {
      return NextResponse.json(
        {
          ok: false,
          message: err.message,
          data: {
            payoutOnboarding: {
              status: "pending_razorpayx",
              error: { code: err.code, message: err.message },
            },
          },
        },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, message: msg },
      { status: 500 },
    );
  }
}
