const STORAGE_PREFIX = "erp:";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function namespacedKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

export async function asyncStorageGetItem(key: string): Promise<string | null> {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(namespacedKey(key));
  } catch {
    return null;
  }
}

export async function asyncStorageSetItem(key: string, value: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(namespacedKey(key), value);
  } catch {
    // Ignore quota/security errors; cache is best-effort.
  }
}

export async function asyncStorageRemoveItem(key: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(namespacedKey(key));
  } catch {
    // Ignore cache remove failures.
  }
}
