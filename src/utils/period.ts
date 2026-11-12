export interface IPeriodStarts {
  mtdStart: string;
  ytdStart: string;
}

export function monthStartUtc(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

export function yearStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

export function periodStartsUtc(now: Date = new Date()): IPeriodStarts {
  return { mtdStart: monthStartUtc(now), ytdStart: yearStartUtc(now) };
}

/** Month bucket as `year * 100 + month` (for example 202607), in UTC. */
export function monthBucketUtc(instant: Date | string): number {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

/** An instant as `YYYY-MM-DDTHH:mm:ss.sssZ`, the stored timestamp format. */
export function toUtc(instant: Date | string): string {
  return new Date(instant).toISOString();
}

export function nowUtc(): string {
  return toUtc(new Date());
}
