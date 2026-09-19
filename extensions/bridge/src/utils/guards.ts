// Message data is untrusted input, and TypeScript types are not validation: these narrow it
// before the bridge uses it.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}
