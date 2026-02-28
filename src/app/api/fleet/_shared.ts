import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import type { Role } from "@/lib/types";

interface ActorProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface FleetActor {
  id: string;
  role: Role;
  active: boolean;
}

export async function requireFleetActor() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("auth_get_my_profile_v1");
  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return {
        error: NextResponse.json({ ok: false, message: "Missing RPC: auth_get_my_profile_v1" }, { status: 500 }),
      };
    }
    return {
      error: NextResponse.json({ ok: false, message: rpcError.message ?? "Unauthorized" }, { status: 401 }),
    };
  }

  const profile = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ActorProfileRow | null)
    : ((rpcData ?? null) as ActorProfileRow | null);

  if (!profile || !profile.active) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  return {
    supabase,
    actor: {
      id: profile.id,
      role: profile.role,
      active: profile.active,
    } satisfies FleetActor,
  };
}

export function mapFleetRpcError(message: string, code?: string) {
  if (message?.includes("forbidden")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (message?.includes("vendor_not_found")) return NextResponse.json({ ok: false, message: "Vendor not found" }, { status: 404 });
  if (message?.includes("vehicle_not_found")) return NextResponse.json({ ok: false, message: "Vehicle not found" }, { status: 404 });
  if (message?.includes("vehicle_not_vendor")) return NextResponse.json({ ok: false, message: "Vehicle is not a vendor vehicle" }, { status: 400 });
  if (message?.includes("driver_not_found")) return NextResponse.json({ ok: false, message: "Driver not found" }, { status: 404 });
  if (message?.includes("driver_vendor_mismatch")) return NextResponse.json({ ok: false, message: "Driver does not belong to this vendor" }, { status: 400 });
  if (message?.includes("driver_inactive")) return NextResponse.json({ ok: false, message: "Driver is inactive" }, { status: 400 });
  if (message?.includes("driver_on_trip")) return NextResponse.json({ ok: false, message: "Driver is currently assigned on a trip" }, { status: 409 });
  if (message?.includes("owner_driver_vendor_single_driver_only")) {
    return NextResponse.json(
      { ok: false, message: "Owner driver setup allows only one active driver" },
      { status: 400 },
    );
  }
  if (message?.includes("owner_driver_vendor_single_vehicle_only")) {
    return NextResponse.json(
      { ok: false, message: "Owner driver setup allows only one vehicle" },
      { status: 400 },
    );
  }
  if (message?.includes("owner_driver_not_allowed_for_vendor_fleet")) {
    return NextResponse.json(
      { ok: false, message: "Owner driver flag is not allowed for vendor fleet drivers" },
      { status: 400 },
    );
  }
  if (message?.includes("owner_driver_required_for_owner_vehicle")) {
    return NextResponse.json(
      { ok: false, message: "Owner driver vehicle must use its owner driver" },
      { status: 400 },
    );
  }
  if (message?.includes("full_name_required")) return NextResponse.json({ ok: false, message: "Driver name is required" }, { status: 400 });
  if (message?.includes("phone_required")) return NextResponse.json({ ok: false, message: "Driver phone is required" }, { status: 400 });
  if (message?.includes("vehicle_number_required")) return NextResponse.json({ ok: false, message: "Vehicle number is required" }, { status: 400 });
  if (message?.includes("vehicle_type_required")) return NextResponse.json({ ok: false, message: "Vehicle type is required" }, { status: 400 });
  if (message?.includes("not_found")) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "22023") return NextResponse.json({ ok: false, message }, { status: 400 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
