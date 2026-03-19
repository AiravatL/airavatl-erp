import { NextResponse } from "next/server";
import { requireMapsActor, getGoogleMapsApiKey, missingKeyResponse } from "@/app/api/maps/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireMapsActor();
  if ("error" in actorResult) return actorResult.error;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return missingKeyResponse();

  const { searchParams } = new URL(request.url);
  const input = searchParams.get("input")?.trim();
  const sessionToken = searchParams.get("sessionToken") ?? undefined;

  if (!input || input.length < 2) {
    return NextResponse.json({ ok: true, data: { predictions: [] } });
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
  }));

  return NextResponse.json({ ok: true, data: { predictions } });
}
