/**
 * Test fixtures — signs in all seed users once and caches the result.
 *
 * Usage in test files:
 *   let f: Fixtures;
 *   beforeAll(async () => { f = await getFixtures(); });
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env here too — globalSetup runs in a separate process
dotenv.config({ path: path.resolve(__dirname, '../config/.env.development') });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserFixture {
  uid: string;
  email: string;
  role: string;
  agentCode: string | null;
  groupKey: string | null;
  token: string;
}

export interface GroupFixture {
  id: string;
  name: string;
  trainerKey: string;
  leaderKey: string;
  memberKeys: string[];
}

export interface Fixtures {
  password: string;
  users: Record<string, UserFixture>;
  groups: Record<string, GroupFixture>;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

interface ManifestUser {
  uid: string;
  email: string;
  role: string;
  agentCode: string | null;
  groupKey: string | null;
}

interface Manifest {
  password: string;
  users: Record<string, ManifestUser>;
  groups: Record<string, GroupFixture>;
}

function loadManifest(): Manifest {
  const manifestPath = path.resolve(__dirname, '../scripts/seed-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `seed-manifest.json not found. Run "npm run seed" first.\n  Expected: ${manifestPath}`,
    );
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;
}

// ---------------------------------------------------------------------------
// Firebase Auth REST sign-in
// ---------------------------------------------------------------------------

async function signIn(email: string, password: string): Promise<string> {
  // eslint-disable-next-line no-process-env
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('FIREBASE_API_KEY is not set. Check config/.env.development');
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const data = (await res.json()) as { idToken?: string; error?: { message: string } };

  if (!data.idToken) {
    throw new Error(
      `Sign-in failed for ${email}: ${data.error?.message ?? JSON.stringify(data)}`,
    );
  }

  return data.idToken;
}

// ---------------------------------------------------------------------------
// Cache + factory
// ---------------------------------------------------------------------------

let cached: Fixtures | null = null;

export async function getFixtures(): Promise<Fixtures> {
  if (cached) return cached;

  const manifest = loadManifest();

  const users: Record<string, UserFixture> = {};

  // Sign in all users in parallel
  await Promise.all(
    Object.entries(manifest.users).map(async ([key, u]) => {
      const token = await signIn(u.email, manifest.password);
      users[key] = { ...u, token };
    }),
  );

  cached = {
    password: manifest.password,
    users,
    groups: manifest.groups,
  };

  return cached;
}
