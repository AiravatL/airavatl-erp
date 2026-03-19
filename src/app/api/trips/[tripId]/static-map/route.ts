import { NextResponse } from "next/server";
import { requireTripActor } from "@/app/api/trips/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const pickupLat = searchParams.get("pickupLat");
  const pickupLng = searchParams.get("pickupLng");
  const deliveryLat = searchParams.get("deliveryLat");
  const deliveryLng = searchParams.get("deliveryLng");
  const driverLat = searchParams.get("driverLat");
  const driverLng = searchParams.get("driverLng");

  if (!pickupLat || !pickupLng || !deliveryLat || !deliveryLng) {
    return NextResponse.json(
      { ok: false, message: "Missing pickup or delivery coordinates" },
      { status: 400 },
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, message: "Map service not configured" },
      { status: 500 },
    );
  }

  const markers: string[] = [
    `markers=color:green|label:P|${pickupLat},${pickupLng}`,
    `markers=color:red|label:D|${deliveryLat},${deliveryLng}`,
  ];

  if (driverLat && driverLng) {
    markers.push(`markers=color:blue|label:T|${driverLat},${driverLng}`);
  }

  const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&maptype=roadmap&${markers.join("&")}&key=${apiKey}`;

  return NextResponse.redirect(staticUrl);
}
