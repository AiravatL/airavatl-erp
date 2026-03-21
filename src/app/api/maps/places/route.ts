import { NextResponse } from "next/server";
import {
  requireMapsActor,
  getGoogleMapsApiKey,
  missingKeyResponse,
  enforceMapsRateLimit,
} from "@/app/api/maps/_shared";

export const dynamic = "force-dynamic";

const MIN_SEARCH_CHARS = 5;
const MAX_SEARCH_CHARS = 120;
const PREDICTION_LIMIT = 5;
const PLACES_CACHE_TTL_MS = 60_000;
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEANINGFUL_QUERY_RE = /[\p{L}\p{N}]/u;
const placesCache = new Map<string, { expiresAt: number; predictions: Array<{
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
}> }>();

export async function GET(request: Request) {
  const actorResult = await requireMapsActor();
  if ("error" in actorResult) return actorResult.error;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return missingKeyResponse();

  const { searchParams } = new URL(request.url);
  const input = searchParams.get("input")?.replace(/\s+/g, " ").trim() ?? "";
  const rawSessionToken = searchParams.get("sessionToken")?.trim() ?? "";
  const sessionToken = UUID_LIKE_RE.test(rawSessionToken) ? rawSessionToken : undefined;

  if (!input || input.length < MIN_SEARCH_CHARS) {
    return NextResponse.json({ ok: true, data: { predictions: [] } });
  }
  if (input.length > MAX_SEARCH_CHARS) {
    return NextResponse.json({ ok: false, message: "Search query is too long" }, { status: 400 });
  }
  if (!MEANINGFUL_QUERY_RE.test(input)) {
    return NextResponse.json({ ok: true, data: { predictions: [] } });
  }

  const rateLimitResponse = enforceMapsRateLimit(actorResult.actor.id, "places");
  if (rateLimitResponse) return rateLimitResponse;

  const cacheKey = `${actorResult.actor.id}:${input.toLowerCase()}`;
  const cached = placesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, data: { predictions: cached.predictions } });
  }

  const params = new URLSearchParams({
    input,
    key: apiKey,
    components: "country:in",
    types: "geocode|establishment",
    language: "en",
  });
  if (sessionToken) params.set("sessiontoken", sessionToken);

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, message: "Google Places API error" },
      { status: 502 },
    );
  }

  const body = (await res.json()) as {
    status: string;
    predictions?: Array<{
      place_id: string;
      description: string;
      structured_formatting?: {
        main_text?: string;
        secondary_text?: string;
      };
    }>;
    error_message?: string;
  };

  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") {
    return NextResponse.json(
      { ok: false, message: body.error_message ?? "Google Places API error" },
      { status: 502 },
    );
  }

  const predictions = (body.predictions ?? []).map((p) => ({
    placeId: p.place_id,
    primaryText: p.structured_formatting?.main_text ?? p.description,
    secondaryText: p.structured_formatting?.secondary_text ?? "",
    fullText: p.description,
  })).slice(0, PREDICTION_LIMIT);

  placesCache.set(cacheKey, {
    predictions,
    expiresAt: Date.now() + PLACES_CACHE_TTL_MS,
  });

  return NextResponse.json({ ok: true, data: { predictions } });
}
