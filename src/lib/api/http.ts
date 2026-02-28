interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  message?: string;
}

export async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Request failed");
  }

  return payload.data as T;
}

