import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireTripActor, mapTripRpcError } from "@/app/api/trips/_shared";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "get_driver_location_for_trip",
    {
      p_trip_id: tripId,
      p_user_id: actorResult.actor.id,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: get_driver_location_for_trip" },
        { status: 500 },
      );
    }
    return mapTripRpcError(
      rpcError.message ?? "Unable to fetch driver location",
      rpcError.code,
    );
  }

  const d = rpcData as Record<string, unknown> | null;
  if (!d) {
    return NextResponse.json({
      ok: true,
      data: {
        location: null,
        minutesSinceUpdate: 0,
        isStale: true,
        staleWarning: "No location data available",
        etaMinutes: null,
        trackingMode: "off",
        destination: null,
      },
    });
  }

  const loc = d.location as Record<string, unknown> | null;

  return NextResponse.json({
    ok: true,
    data: {
      location: loc
        ? {
            latitude: loc.latitude,
            longitude: loc.longitude,
            heading: loc.heading ?? null,
            speedKmph: loc.speed_kmph ?? null,
            updatedAt: loc.updated_at ?? null,
          }
        : null,
      minutesSinceUpdate: (d.minutes_since_update as number) ?? 0,
      isStale: (d.is_stale as boolean) ?? false,
      staleWarning: (d.stale_warning as string) ?? null,
      etaMinutes: (d.eta_minutes as number) ?? null,
      trackingMode: (d.current_tracking_mode as string) ?? "off",
      destination: (d.destination as Record<string, unknown>) ?? null,
    },
  });
}
