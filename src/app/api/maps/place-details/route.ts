import { NextResponse } from "next/server";
import {
  requireMapsActor,
  getGoogleMapsApiKey,
  missingKeyResponse,
  enforceMapsRateLimit,
} from "@/app/api/maps/_shared";

export const dynamic = "force-dynamic";

const MAX_PLACE_ID_LENGTH = 200;
const PLACE_ID_RE = /^[A-Za-z0-9_-]+$/;
const PLACE_DETAILS_CACHE_TTL_MS = 10 * 60_000;
const placeDetailsCache = new Map<string, { expiresAt: number; data: unknown }>();

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

function extractCity(components: AddressComponent[]): string {
  for (const c of components) {
    if (c.types.includes("locality")) return c.long_name;
  }
  for (const c of components) {
    if (c.types.includes("administrative_area_level_2")) return c.long_name;
  }
  for (const c of components) {
    if (c.types.includes("sublocality_level_1")) return c.long_name;
  }
  return "";
}

function extractState(components: AddressComponent[]): string | null {
  for (const c of components) {
    if (c.types.includes("administrative_area_level_1")) return c.long_name;
  }
  return null;
}

export async function GET(request: Request) {
  const actorResult = await requireMapsActor();
  if ("error" in actorResult) return actorResult.error;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return missingKeyResponse();

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim() ?? "";

  if (!placeId) {
    return NextResponse.json(
      { ok: false, message: "placeId is required" },
      { status: 400 },
    );
  }
  if (placeId.length > MAX_PLACE_ID_LENGTH || !PLACE_ID_RE.test(placeId)) {
    return NextResponse.json(
      { ok: false, message: "Invalid placeId" },
      { status: 400 },
    );
  }

  const rateLimitResponse = enforceMapsRateLimit(actorResult.actor.id, "place-details");
  if (rateLimitResponse) return rateLimitResponse;

  const cacheKey = `${actorResult.actor.id}:${placeId}`;
  const cached = placeDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, data: cached.data });
  }

  const params = new URLSearchParams({
    place_id: placeId,
    key: apiKey,
    fields: "place_id,formatted_address,geometry,address_components,name",
    language: "en",
  });

  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, message: "Google Place Details API error" },
      { status: 502 },
    );
  }

  const body = (await res.json()) as {
    status: string;
    result?: {
      place_id: string;
      formatted_address: string;
      name?: string;
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: AddressComponent[];
    };
    error_message?: string;
  };

  if (body.status !== "OK" || !body.result) {
    return NextResponse.json(
      { ok: false, message: body.error_message ?? "Place not found" },
      { status: body.status === "NOT_FOUND" ? 404 : 502 },
    );
  }

  const r = body.result;
  const components = r.address_components ?? [];
  const city = extractCity(components);
  const state = extractState(components);

  const data = {
    placeId: r.place_id,
    formattedAddress: r.formatted_address,
    latitude: r.geometry?.location?.lat ?? 0,
    longitude: r.geometry?.location?.lng ?? 0,
    city,
    state,
    primaryText: r.name ?? city,
    secondaryText: state ? `${city}, ${state}` : city,
    addressComponents: components.map((c) => ({
      longName: c.long_name,
      shortName: c.short_name,
      types: c.types,
    })),
  };

  placeDetailsCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + PLACE_DETAILS_CACHE_TTL_MS,
  });

  return NextResponse.json({ ok: true, data });
}
