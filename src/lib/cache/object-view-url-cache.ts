import {
  asyncStorageGetItem,
  asyncStorageRemoveItem,
  asyncStorageSetItem,
} from "@/lib/cache/async-storage";

interface CachedObjectViewUrlEntry {
  viewUrl: string;
  expiresAtMs: number;
  updatedAtMs: number;
}

interface CachePayloadV1 {
  version: 1;
  entries: Record<string, CachedObjectViewUrlEntry>;
}

const CACHE_KEY = "object-view-url-cache:v1";
const MAX_ENTRIES = 200;
const SAFETY_WINDOW_MS = 30_000;
const DEFAULT_TTL_MS = 4 * 60_000;

let memoryCache: Map<string, CachedObjectViewUrlEntry> = new Map();
let hydrated = false;

function nowMs(): number {
  return Date.now();
}

function estimateExpiryFromUrl(viewUrl: string): number | null {
  try {
    const url = new URL(viewUrl);
    const amzDate = url.searchParams.get("X-Amz-Date");
    const amzExpires = url.searchParams.get("X-Amz-Expires");
    if (!amzDate || !amzExpires) return null;
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
    if (!match) return null;
    const [, year, month, day, hour, min, sec] = match;
    const issuedAtMs = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(min),
      Number(sec),
    );
    const ttlMs = Number(amzExpires) * 1000;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return null;
    return issuedAtMs + ttlMs;
  } catch {
    return null;
  }
}

function pruneInMemoryCache(currentTime: number) {
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAtMs <= currentTime + SAFETY_WINDOW_MS) {
      memoryCache.delete(key);
    }
  }

  if (memoryCache.size <= MAX_ENTRIES) return;

  const sorted = [...memoryCache.entries()].sort((a, b) => b[1].updatedAtMs - a[1].updatedAtMs);
  memoryCache = new Map(sorted.slice(0, MAX_ENTRIES));
}

async function hydrateIfNeeded() {
  if (hydrated) return;
  hydrated = true;

  const raw = await asyncStorageGetItem(CACHE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as CachePayloadV1;
    if (parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object") return;
    memoryCache = new Map(Object.entries(parsed.entries));
    pruneInMemoryCache(nowMs());
  } catch {
    await asyncStorageRemoveItem(CACHE_KEY);
  }
}

async function persistCache() {
  const entries = Object.fromEntries(memoryCache.entries());
  const payload: CachePayloadV1 = { version: 1, entries };
  await asyncStorageSetItem(CACHE_KEY, JSON.stringify(payload));
}

export interface CachedObjectViewUrl {
  viewUrl: string;
  expiresIn: number | null;
}

export async function getCachedObjectViewUrl(
  objectKey: string,
  minRemainingMs = SAFETY_WINDOW_MS,
): Promise<CachedObjectViewUrl | null> {
  await hydrateIfNeeded();
  const entry = memoryCache.get(objectKey);
  if (!entry) return null;

  const remainingMs = entry.expiresAtMs - nowMs();
  if (remainingMs <= minRemainingMs) {
    memoryCache.delete(objectKey);
    await persistCache();
    return null;
  }

  return {
    viewUrl: entry.viewUrl,
    expiresIn: Math.max(1, Math.floor(remainingMs / 1000)),
  };
}

export async function setCachedObjectViewUrl(
  objectKey: string,
  data: { viewUrl: string; expiresIn: number | null },
): Promise<void> {
  await hydrateIfNeeded();

  const now = nowMs();
  const explicitExpiry = data.expiresIn ? now + data.expiresIn * 1000 : null;
  const inferredExpiry = estimateExpiryFromUrl(data.viewUrl);
  const expiresAtMs = explicitExpiry ?? inferredExpiry ?? now + DEFAULT_TTL_MS;

  memoryCache.set(objectKey, {
    viewUrl: data.viewUrl,
    expiresAtMs,
    updatedAtMs: now,
  });

  pruneInMemoryCache(now);
  await persistCache();
}

export async function invalidateCachedObjectViewUrl(objectKey: string): Promise<void> {
  await hydrateIfNeeded();
  if (memoryCache.delete(objectKey)) {
    await persistCache();
  }
}
