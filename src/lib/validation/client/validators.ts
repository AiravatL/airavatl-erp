const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

export function sanitizePhoneInput(value: string, maxDigits: number): string {
  const plusPrefix = value.trim().startsWith("+") ? "+" : "";
  const digits = value.replace(/\D/g, "").slice(0, Math.max(1, maxDigits));
  return `${plusPrefix}${digits}`;
}

interface DecimalOptions {
  maxIntegerDigits: number;
  maxFractionDigits: number;
  allowEmpty?: boolean;
}

export function sanitizeDecimalInput(value: string, options: DecimalOptions): string {
  const raw = value.replace(/[^\d.]/g, "");
  if (!raw) return options.allowEmpty === false ? "0" : "";

  const dotIndex = raw.indexOf(".");
  if (dotIndex === -1) {
    return raw.slice(0, Math.max(1, options.maxIntegerDigits));
  }

  const integerPart = raw.slice(0, dotIndex).slice(0, Math.max(1, options.maxIntegerDigits));
  const fractionPart = raw
    .slice(dotIndex + 1)
    .replace(/\./g, "")
    .slice(0, Math.max(0, options.maxFractionDigits));

  return `${integerPart}.${fractionPart}`;
}

export function sanitizeIntegerInput(value: string, maxDigits: number): string {
  return value.replace(/\D/g, "").slice(0, Math.max(1, maxDigits));
}

export function isNumericInRange(value: string, min: number, max: number): boolean {
  if (!value.trim()) return false;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return false;
  return parsed >= min && parsed <= max;
}
