/**
 * Jest globalSetup — runs once before any test file.
 * Loads the .env.development file so all env vars are available.
 */
import dotenv from 'dotenv';
import path from 'path';

export default function globalSetup() {
  dotenv.config({ path: path.resolve(__dirname, '../config/.env.development') });
}
