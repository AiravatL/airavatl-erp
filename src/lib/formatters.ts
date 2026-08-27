export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * The one way phone numbers are shown in the ERP.
 *
 * Storage is inconsistent by table: user_profiles.phone and most
 * delivery_requests contacts are "91XXXXXXXXXX", while consigner leads and
 * profiles hold a bare 10-digit number. Neither shape is worth putting in front
 * of an operator — the country code is noise when every number is Indian, and
 * the inconsistency makes the same person look like two different records.
 *
 * Display is always the local number, grouped: "70027 81195".
 *
 * Format at the point of display ONLY. The stored value keeps its country code
 * and is what must be used for tel: links, search matching, and anything handed
 * to a provider (WhatsApp, SMS) — all of which need it.
 *
 * Anything that is not a recognisable Indian mobile is returned untouched
 * rather than guessed at, so an international or malformed number is never
 * silently mangled into something wrong.
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return "";

  let local = digits;
  if (/^91[6-9][0-9]{9}$/.test(digits)) {
    local = digits.slice(2);
  } else if (/^0[6-9][0-9]{9}$/.test(digits)) {
    local = digits.slice(1);
  }

  if (/^[6-9][0-9]{9}$/.test(local)) {
    return `${local.slice(0, 5)} ${local.slice(5)}`;
  }

  return value.trim();
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
