import {
  monthBucketUtc,
  monthStartUtc,
  periodStartsUtc,
  yearStartUtc,
} from '@src/utils/period';

describe('UTC period helpers', () => {
  const lateOnLastDay = new Date('2026-07-31T23:30:00.000Z');

  it('puts 23:30 UTC on the last day of a month in that month', () => {
    expect(monthBucketUtc(lateOnLastDay)).toBe(202607);
    expect(monthStartUtc(lateOnLastDay)).toBe('2026-07-01T00:00:00.000Z');
  });

  it('puts the first instant of a month in the new month', () => {
    const first = new Date('2026-08-01T00:00:00.000Z');

    expect(monthBucketUtc(first)).toBe(202608);
    expect(monthStartUtc(first)).toBe('2026-08-01T00:00:00.000Z');
  });

  it('starts the year on 1 January UTC', () => {
    expect(yearStartUtc(lateOnLastDay)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('buckets an ISO string by its UTC month regardless of offset text', () => {
    expect(monthBucketUtc('2026-01-31T23:30:00-05:00')).toBe(202602);
  });

  it('returns both period starts for a given instant', () => {
    expect(periodStartsUtc(lateOnLastDay)).toEqual({
      mtdStart: '2026-07-01T00:00:00.000Z',
      ytdStart: '2026-01-01T00:00:00.000Z',
    });
  });
});
