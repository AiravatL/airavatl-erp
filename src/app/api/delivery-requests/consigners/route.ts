import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireDeliveryRequestActor } from "@/app/api/delivery-requests/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireDeliveryRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 20);

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "auction_list_consigners_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_search: search,
      p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: auction_list_consigners_v1" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to fetch consigners" },
      { status: 500 },
    );
  }

  const result = rpcData as { items: Array<{
    consigner_id: string;
    display_name: string;
    phone: string;
    contact_name: string;
    business_name: string | null;
    sales_owner_id: string | null;
    sales_owner_name: string | null;
  }> } | null;

  const items = (result?.items ?? []).map((row) => ({
    consignerId: row.consigner_id,
    displayName: row.display_name,
    phone: row.phone,
    contactName: row.contact_name,
    businessName: row.business_name ?? "",
    salesOwnerId: row.sales_owner_id ?? "",
    salesOwnerName: row.sales_owner_name ?? "",
  }));

  return NextResponse.json({ ok: true, data: { items } });
}
