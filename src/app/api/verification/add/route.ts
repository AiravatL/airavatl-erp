import { NextResponse } from "next/server";
import { requireVerificationActor } from "@/app/api/verification/_shared";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

interface CreatePartnerBody {
  fullName?: unknown;
  phone?: unknown;
  role?: unknown;
  organizationName?: unknown;
}

const PHONE_REGEX = /^[0-9]{10}$/;
const ALLOWED_ROLES = ["individual_driver", "transporter"];
const CREATE_ALLOWED_ROLES = ["super_admin", "admin", "sales_vehicles"] as const;

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const actorResult = await requireVerificationActor(CREATE_ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as CreatePartnerBody | null;
  const fullName = toTrimmedString(body?.fullName);
  const phone = toTrimmedString(body?.phone);
  const role = toTrimmedString(body?.role);
  const organizationName = toTrimmedString(body?.organizationName);

  if (!fullName) {
    return NextResponse.json({ ok: false, message: "fullName is required" }, { status: 400 });
  }
  if (fullName.length > 100) {
    return NextResponse.json({ ok: false, message: "fullName must be at most 100 characters" }, { status: 400 });
  }
  if (!PHONE_REGEX.test(phone)) {
    return NextResponse.json({ ok: false, message: "phone must be exactly 10 digits" }, { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ ok: false, message: "role must be individual_driver or transporter" }, { status: 400 });
  }
  if (role === "transporter" && !organizationName) {
    return NextResponse.json({ ok: false, message: "organizationName is required for transporters" }, { status: 400 });
  }

  const formattedPhone = `91${phone}`;
  const adminClient = getSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "Missing server config: SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 },
    );
  }

  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    phone: formattedPhone,
    phone_confirm: true,
    user_metadata: {
      full_name: fullName,
      user_type: role,
      ...(role === "transporter" && organizationName ? { organization_name: organizationName } : {}),
    },
  });

  if (createError) {
    const msg = createError.message ?? "";
    if (msg.includes("already") || msg.includes("duplicate") || msg.includes("exists")) {
      return NextResponse.json(
        { ok: false, message: "A partner with this phone number already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, message: msg || "Unable to create partner" },
      { status: 500 },
    );
  }

  if (!createData.user) {
    return NextResponse.json({ ok: false, message: "Unable to create partner" }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, data: { userId: createData.user.id } },
    { status: 201 },
  );
}
