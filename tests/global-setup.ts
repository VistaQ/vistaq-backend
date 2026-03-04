/**
 * Jest global setup — runs once before all test suites.
 *
 * Sets NODE_ENV to "test" so the app suppresses helmet and
 * skips pino-pretty transport configuration during tests.
 */
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
}
