import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Jest global setup — runs once before all test suites.
 *
 * Loads .env from the project root, then sets NODE_ENV to "test" so the app
 * suppresses helmet and skips pino-pretty transport configuration during tests.
 */
export default function globalSetup(): void {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  process.env.NODE_ENV = 'test';
}
