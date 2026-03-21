import { requireServerActor } from "@/lib/auth/server-actor";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAYMENTS_ALLOWED_ROLES: Role[] = ["super_admin", "admin", "accounts"];

export interface PaymentActor {
  id: string;
  role: Role;
}

export async function requirePaymentActor() {
  const actorResult = await requireServerActor(PAYMENTS_ALLOWED_ROLES);
  if ("error" in actorResult) return { error: actorResult.error };
  return { supabase: actorResult.supabase, actor: actorResult.actor as PaymentActor };
}
