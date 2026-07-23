/**
 * Strips `undefined`-valued keys from a partial update payload. Drizzle's own `mapUpdateSet`
 * already filters `undefined` out of a `.set()` call, but throws "No values to set" if the
 * result is empty (e.g. a PUT body that changed nothing) - this lets model `update()` methods
 * check `Object.keys(cleaned).length` first and skip the write entirely instead of erroring.
 */
export function cleanPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const cleaned: Partial<T> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (cleaned as Record<string, unknown>)[key] = value;
  }
  return cleaned;
}
