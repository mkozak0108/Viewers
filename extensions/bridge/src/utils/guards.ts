// Message data is untrusted input, and TypeScript types are not validation. Both apps use these
// to narrow it: imported by the bridge as `./utils/guards` and by the scoring app as
// `@bridge-utils/guards`. No imports, like `messages.ts`.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}
