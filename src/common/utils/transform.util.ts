export function normalizeTrimmedString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function parseIntegerInput(value: unknown): unknown {
  return typeof value === 'string' ? Number.parseInt(value, 10) : value;
}
