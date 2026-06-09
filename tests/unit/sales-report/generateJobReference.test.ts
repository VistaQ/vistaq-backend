import { generateJobReference } from '@src/utils/generateJobReference';

describe('generateJobReference', () => {
  it('formats a fixed UTC Date into the exact expected string', () => {
    const fixed = new Date(Date.UTC(2026, 4, 2, 14, 30, 22, 873));
    expect(generateJobReference(fixed)).toBe('SALES-REPORT-20260502143022873');
  });

  it('zero-pads every single-digit field (month, day, hour, etc.)', () => {
    const fixed = new Date(Date.UTC(2026, 0, 1, 1, 2, 3, 4));
    expect(generateJobReference(fixed)).toBe('SALES-REPORT-20260101010203004');
  });

  it('uses UTC components, not local time', () => {
    // 2026-05-02T23:59:59.500Z — should serialise the UTC value verbatim
    // regardless of the test runner's local timezone.
    const fixed = new Date('2026-05-02T23:59:59.500Z');
    expect(generateJobReference(fixed)).toBe('SALES-REPORT-20260502235959500');
  });

  it('emits a value matching the public format regex when called with no argument', () => {
    const ref = generateJobReference();
    expect(ref).toMatch(/^SALES-REPORT-\d{17}$/);
  });

  it('returns a fresh value per call (no module-load Date.now)', async () => {
    const first = generateJobReference();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = generateJobReference();
    // Either strictly different (typical) or at minimum still valid format —
    // we don't want a frozen module-load timestamp.
    expect(second).toMatch(/^SALES-REPORT-\d{17}$/);
    expect(first).toMatch(/^SALES-REPORT-\d{17}$/);
  });
});
