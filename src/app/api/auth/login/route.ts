import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, code: "MISSING_FIELDS", message: "Email and password are required" },
      { status: 400 },
    );
  }

  if (
    email.length > EMAIL_MAX_LENGTH ||
    !EMAIL_REGEX.test(email) ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "Invalid email or password format" },
      { status: 400 },
    );
  }

  const supabase = await getSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, code: "AUTH_ERROR", message: "Invalid credentials" },
      { status: 401 },
    );
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("auth_get_my_profile_v1");
  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, code: "MISSING_RPC", message: "Missing RPC: auth_get_my_profile_v1" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: false, code: "PROFILE_ERROR", message: rpcError.message },
      { status: 500 },
    );
  }

  const profile = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  return NextResponse.json({
    ok: true,
    data: {
      user: profile
        ? {
            id: profile.id,
            fullName: profile.full_name,
            email: profile.email,
            role: profile.role,
            active: profile.active,
          }
        : null,
    },
  });
}
