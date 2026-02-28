function truncate(value: string, maxLength?: number): string {
  if (!maxLength || maxLength < 1) return value;
  return value.slice(0, maxLength);
}

export function sanitizeSingleLineInput(value: string, maxLength?: number): string {
  const normalized = value
    .replace(/\u0000/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ");
  return truncate(normalized, maxLength);
}

export function sanitizeMultilineInput(value: string, maxLength?: number): string {
  const normalized = value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return truncate(normalized, maxLength);
}

export function normalizeSingleLineForSubmit(value: string, maxLength?: number): string {
  return sanitizeSingleLineInput(value, maxLength).trim();
}

export function normalizeMultilineForSubmit(value: string, maxLength?: number): string {
  return sanitizeMultilineInput(value, maxLength).trim();
}
