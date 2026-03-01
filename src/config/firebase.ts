import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth as getClientAuth } from 'firebase/auth';

/******************************************************************************
                            Firebase Admin SDK Setup
******************************************************************************/

// Initialize Firebase Admin SDK
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set',
  );
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

// Export Admin SDK instances
export const adminAuth = admin.auth();
export const db = getFirestore(process.env.FIREBASE_DATABASE_ID ?? '(default)');

/******************************************************************************
                            Firebase Client SDK Setup
******************************************************************************/

// Firebase Client SDK configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
};

// Validate client configuration
if (
  !firebaseConfig.apiKey ||
  !firebaseConfig.authDomain ||
  !firebaseConfig.projectId
) {
  throw new Error(
    'Missing Firebase Client SDK configuration. Check environment variables.',
  );
}

// Initialize Firebase Client SDK
const clientApp = initializeApp(firebaseConfig);
export const clientAuth = getClientAuth(clientApp);

/******************************************************************************
                            Helper Functions
******************************************************************************/

/**
 * Get user document from Firestore by UID
 */
export async function getUserByUid(
  uid: string,
): Promise<Record<string, unknown> | null> {
  const userDoc = await db.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    return null;
  }

  return {
    uid: userDoc.id,
    ...userDoc.data(),
  };
}

/**
 * Check if user exists and is active
 */
export async function isUserActive(uid: string): Promise<boolean> {
  const user = await getUserByUid(uid);
  return user !== null && user.status === 'active';
}
