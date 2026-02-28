import type { User } from "@/lib/types";
import { apiRequest } from "@/lib/api/http";

export async function getCurrentUserProfile(): Promise<User | null> {
  return apiRequest<User | null>("/api/auth/me", {
    method: "GET",
    cache: "no-store",
  });
}

