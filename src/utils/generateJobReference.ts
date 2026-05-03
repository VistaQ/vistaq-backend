/**
 * Generates a human-readable, business-meaningful identifier for a sales
 * report job. The reference is the public-facing ID used in URLs, ETL
 * payloads, callbacks, and polling — the UUID `id` stays internal.
 *
 * Format: `SALES-REPORT-YYYYMMDDHHMMSSsss` (UTC, milliseconds appended to
 * make collisions on rapid uploads astronomically unlikely).
 *
 * @param now - optional Date override for deterministic testing.
 *              Defaults to a fresh `new Date()` per call.
 */
export function generateJobReference(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const ms = String(now.getUTCMilliseconds()).padStart(3, '0');
  return `SALES-REPORT-${yyyy}${mm}${dd}${hh}${mi}${ss}${ms}`;
}

export default generateJobReference;
