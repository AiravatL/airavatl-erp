import { NextResponse } from "next/server";
import { requireMapsActor, getGoogleMapsApiKey, missingKeyResponse } from "@/app/api/maps/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireMapsActor();
  if ("error" in actorResult) return actorResult.error;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return missingKeyResponse();

  const { searchParams } = new URL(request.url);
  const originLat = searchParams.get("originLat");
  const originLng = searchParams.get("originLng");
  const destLat = searchParams.get("destLat");
  const destLng = searchParams.get("destLng");

  if (!originLat || !originLng || !destLat || !destLng) {
    return NextResponse.json(
      { ok: false, message: "originLat, originLng, destLat, destLng are required" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    origin: `${originLat},${originLng}`,
    destination: `${destLat},${destLng}`,
    key: apiKey,
    mode: "driving",
    language: "en",
    units: "metric",
  });

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, message: "Google Directions API error" },
      { status: 502 },
    );
  }

  const body = (await res.json()) as {
    status: string;
    routes?: Array<{
      legs?: Array<{
        distance?: { value: number };
        duration?: { value: number };
      }>;
      overview_polyline?: { points: string };
    }>;
    error_message?: string;
  };

  if (body.status !== "OK" || !body.routes?.length) {
    // Fallback to Haversine distance
    const distanceKm = haversineDistance(
      Number(originLat), Number(originLng),
      Number(destLat), Number(destLng),
    );
    return NextResponse.json({
      ok: true,
      data: {
        distanceKm: Math.round(distanceKm * 10) / 10,
        durationMinutes: null,
        polyline: null,
      },
    });
  }

  const route = body.routes[0];
  const leg = route.legs?.[0];
  const distanceMeters = leg?.distance?.value ?? 0;
  const durationSeconds = leg?.duration?.value ?? 0;

  return NextResponse.json({
    ok: true,
    data: {
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      durationMinutes: durationSeconds > 0 ? Math.round(durationSeconds / 60) : null,
      polyline: route.overview_polyline?.points ?? null,
    },
  });
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
