import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { FirebaseError } from 'firebase/app';
import { signInWithEmailAndPassword } from 'firebase/auth';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import { adminAuth, clientAuth, db, getUserByUid } from '@src/config/firebase';
import {
  CreateUserRequest,
  CreateUserResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  User,
  UserRole,
} from '@src/types/auth.types';

const FieldValue = admin.firestore.FieldValue;

/******************************************************************************
                                Controller
******************************************************************************/

/**
 * Login user with email and password
 * POST /api/auth/login
 */
async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as LoginRequest;

    // Validate input
    if (!email || !password) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Email and password are required',
      });
      return;
    }

    // Authenticate with Firebase Client SDK
    const userCredential = await signInWithEmailAndPassword(
      clientAuth,
      email,
      password,
    );

    const firebaseUser = userCredential.user;
    const uid = firebaseUser.uid;

    // Fetch user data from Firestore
    const userData = await getUserByUid(uid);

    if (!userData) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'User data not found',
      });
      return;
    }

    // Check if user is active
    if (userData.status !== 'active') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'User account is not active',
      });
      return;
    }

    // Get Firebase ID token
    const token = await firebaseUser.getIdToken();

    // Prepare response
    const response: LoginResponse = {
      token,
      user: {
        uid: userData.uid as string,
        email: userData.email as string,
        name: userData.name as string,
        role: userData.role as UserRole,
        groupId: userData.groupId as string,
        groupName: userData.groupName as string,
        agentCode: userData.agentCode as string,
        agency: userData.agency as string,
        location: userData.location as string,
      },
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    // Handle Firebase authentication errors
    if (error instanceof FirebaseError) {
      switch (error.code) {
        case 'auth/wrong-password':
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
          res.status(HttpStatusCodes.UNAUTHORIZED).json({
            error: 'Invalid email or password',
          });
          return;

        case 'auth/too-many-requests':
          res.status(HttpStatusCodes.TOO_MANY_REQUESTS).json({
            error: 'Too many failed login attempts. Please try again later.',
          });
          return;

        case 'auth/user-disabled':
          res.status(HttpStatusCodes.FORBIDDEN).json({
            error: 'User account has been disabled',
          });
          return;

        default:
          console.error('Firebase auth error:', error.code, error.message);
          res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
            error: 'Authentication failed',
          });
          return;
      }
    }

    console.error('Login error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePermissions(role: string): string[] {
  switch (role) {
    case 'admin':
      return ['*'];
    case 'master_trainer':
    case 'trainer':
      return ['view_managed_groups', 'view_managed_sales', 'view_managed_users'];
    case 'group_leader':
      return ['view_own_group', 'view_team_sales', 'create_sales', 'view_own_sales'];
    case 'agent':
      return ['create_sales', 'view_own_sales'];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------

/**
 * Create new user (admin only)
 * POST /api/auth/create-user
 */
async function createUser(req: Request, res: Response): Promise<void> {
  try {
    // -------------------------------------------------------------------------
    // Step 1 — Admin guard
    // -------------------------------------------------------------------------

    if (!req.user || req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only administrators can create users',
      });
      return;
    }

    const {
      email,
      password,
      name,
      role,
      agentCode,
      agency,
      location,
      phone,
    } = req.body as CreateUserRequest;

    // -------------------------------------------------------------------------
    // Step 2 — Validate base fields
    // -------------------------------------------------------------------------

    if (!email || !password || !name || !role) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Email, password, name, and role are required',
      });
      return;
    }

    if (password.length < 6) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Password must be at least 6 characters long',
      });
      return;
    }

    const validRoles = ['admin', 'master_trainer', 'trainer', 'group_leader', 'agent'];
    if (!validRoles.includes(role)) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Invalid role. Must be one of: admin, master_trainer, trainer, group_leader, agent',
      });
      return;
    }

    // -------------------------------------------------------------------------
    // Step 3 — Role-based validation
    // -------------------------------------------------------------------------

    const isMemberRole = role === 'agent' || role === 'group_leader';
    const isTrainerRole = role === 'trainer' || role === 'master_trainer';

    if (isMemberRole) {
      if (!agentCode || agentCode.trim().length === 0) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'Agents and group leaders must have an agent code',
        });
        return;
      }
    }

    // -------------------------------------------------------------------------
    // Step 4 — Create Firebase Auth account
    // -------------------------------------------------------------------------

    let userRecord: admin.auth.UserRecord;

    try {
      userRecord = await adminAuth.createUser({
        email,
        password,
        emailVerified: true,
        disabled: false,
      });
    } catch (authError) {
      const code =
        authError instanceof FirebaseError
          ? authError.code
          : (authError as { code?: string }).code;

      if (code === 'auth/email-already-exists') {
        res.status(HttpStatusCodes.CONFLICT).json({ error: 'Email already exists' });
        return;
      }
      if (code === 'auth/invalid-email') {
        res.status(HttpStatusCodes.BAD_REQUEST).json({ error: 'Invalid email format' });
        return;
      }
      if (code === 'auth/weak-password') {
        res.status(HttpStatusCodes.BAD_REQUEST).json({ error: 'Password is too weak' });
        return;
      }

      console.error('[createUser] Firebase Auth error:', authError);
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create user' });
      return;
    }

    const uid = userRecord.uid;

    // -------------------------------------------------------------------------
    // Step 5 — Build and write Firestore user document
    // -------------------------------------------------------------------------

    const userData: Record<string, unknown> = {
      email,
      name,
      phone: phone ?? '',
      location: location ?? '',
      agency: agency ?? '',
      role,
      permissions: generatePermissions(role),
      groupId: null,
      groupName: null,
      agentCode: isMemberRole ? agentCode!.trim() : null,
      managedGroupIds: isTrainerRole ? [] : null,
      totalProspects: 0,
      totalAppointments: 0,
      totalSales: 0,
      totalACE: 0,
      totalPoints: 0,
      currentBadge: isMemberRole ? 'Rookie' : null,
      currentBadgeColor: isMemberRole ? 'gray' : null,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection('users').doc(uid).set(userData);

    // -------------------------------------------------------------------------
    // Step 6 — Return success
    // -------------------------------------------------------------------------

    console.log(`[createUser] Created ${role} ${uid} (${email})`);

    const response: CreateUserResponse = {
      success: true,
      userId: uid,
      agentCode: isMemberRole ? agentCode!.trim() : undefined,
      message: 'User created successfully',
    };

    res.status(HttpStatusCodes.CREATED).json(response);
  } catch (error) {
    console.error('[createUser] Unexpected error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
    });
  }
}

/**
 * Get current user info
 * GET /api/auth/me
 */
async function getCurrentUser(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    // Return user data (password already excluded)
    res.status(HttpStatusCodes.OK).json({
      user: {
        uid: req.user.uid,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        groupId: req.user.groupId,
        groupName: req.user.groupName,
        agentCode: req.user.agentCode,
        agency: req.user.agency,
        location: req.user.location,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
    });
  }
}

/**
 * Agent self-registration
 * POST /api/auth/register
 *
 * Public endpoint — no authentication required.
 * Creates a Firebase Auth account + Firestore user document for an agent,
 * adds them to an existing group, and returns a ready-to-use ID token.
 */
async function register(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, agentCode, email, password, groupId, acknowledged } =
      req.body as RegisterRequest;

    // -------------------------------------------------------------------------
    // Step 1 — Validate required fields
    // -------------------------------------------------------------------------

    if (!fullName || !agentCode || !email || !password || !groupId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'fullName, agentCode, email, password, and groupId are required',
      });
      return;
    }

    if (fullName.trim().length < 2) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Full name must be at least 2 characters',
      });
      return;
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Invalid email format',
      });
      return;
    }

    if (password.length < 6) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Password must be at least 6 characters',
      });
      return;
    }

    // Privacy policy acknowledgment is mandatory
    if (!acknowledged) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'You must acknowledge the privacy policy',
      });
      return;
    }

    // -------------------------------------------------------------------------
    // Step 2 — Ensure agentCode is unique
    // -------------------------------------------------------------------------

    const agentCodeSnapshot = await db
      .collection('users')
      .where('agentCode', '==', agentCode.trim())
      .limit(1)
      .get();

    if (!agentCodeSnapshot.empty) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Agent code already exists',
      });
      return;
    }

    // -------------------------------------------------------------------------
    // Step 3 — Verify the target group exists
    // -------------------------------------------------------------------------

    const groupDoc = await db.collection('groups').doc(groupId).get();

    if (!groupDoc.exists) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Group not found',
      });
      return;
    }

    const groupData = groupDoc.data()!;
    const groupName = groupData.name as string;

    // -------------------------------------------------------------------------
    // Step 4 — Create Firebase Auth account (Admin SDK)
    // -------------------------------------------------------------------------

    let userRecord: admin.auth.UserRecord;

    try {
      userRecord = await adminAuth.createUser({
        email,
        password,
        emailVerified: true,
        disabled: false,
      });
    } catch (authError) {
      // Check both client-SDK FirebaseError and admin-SDK error shapes
      const code =
        authError instanceof FirebaseError
          ? authError.code
          : (authError as { code?: string }).code;

      if (code === 'auth/email-already-exists') {
        res.status(HttpStatusCodes.CONFLICT).json({
          error: 'Email already registered',
        });
        return;
      }

      console.error('[Register] Firebase Auth createUser error:', authError);
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to create account',
      });
      return;
    }

    const uid = userRecord.uid;

    // -------------------------------------------------------------------------
    // Step 5 — Create Firestore user document
    // -------------------------------------------------------------------------

    const newUser = {
      email,
      name: fullName.trim(),
      phone: '',
      location: '',
      agency: '',

      role: 'agent' as UserRole,
      permissions: ['view_own_sales', 'create_sales'],

      groupId,
      groupName,

      agentCode: agentCode.trim(),
      managedGroupIds: null,

      totalProspects: 0,
      totalAppointments: 0,
      totalSales: 0,
      totalACE: 0,
      totalPoints: 0,
      currentBadge: 'Rookie',
      currentBadgeColor: 'gray',

      status: 'active',

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection('users').doc(uid).set(newUser);

    // -------------------------------------------------------------------------
    // Step 6 — Add user to the group's member list
    // -------------------------------------------------------------------------

    await db
      .collection('groups')
      .doc(groupId)
      .update({
        memberIds: FieldValue.arrayUnion(uid),
        memberCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

    // -------------------------------------------------------------------------
    // Step 7 — Auto-login via Client SDK to get a usable ID token
    // -------------------------------------------------------------------------

    const userCredential = await signInWithEmailAndPassword(
      clientAuth,
      email,
      password,
    );

    const token = await userCredential.user.getIdToken();

    // -------------------------------------------------------------------------
    // Step 8 — Return success response
    // -------------------------------------------------------------------------

    console.log(
      `[Register] Agent ${uid} (${agentCode}) registered and joined group ${groupId} (${groupName})`,
    );

    const response: RegisterResponse = {
      success: true,
      token,
      user: {
        uid,
        email,
        name: fullName.trim(),
        role: 'agent',
        groupId,
        groupName,
        agentCode: agentCode.trim(),
      },
    };

    res.status(HttpStatusCodes.CREATED).json(response);
  } catch (error) {
    console.error('[Register] Unexpected error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
    });
  }
}

/**
 * Trigger a Firebase password reset email
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req: Request, res: Response): Promise<void> {
  // Always return the same response to prevent email enumeration
  const genericSuccess = {
    success: true,
    message:
      'If an account with that email exists, a password reset link has been sent.',
  };

  try {
    const { email } = req.body as { email: string };

    if (!email) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json({ error: 'Email is required' });
      return;
    }

    const apiKey = process.env.FIREBASE_API_KEY;

    if (!apiKey) {
      console.error('[ForgotPassword] FIREBASE_API_KEY is not set');
      res.status(HttpStatusCodes.OK).json(genericSuccess);
      return;
    }

    // Delegate to Firebase — it handles token generation, expiry, and email delivery
    const firebaseRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
      },
    );

    if (!firebaseRes.ok) {
      const err = (await firebaseRes.json()) as { error?: { message?: string } };
      console.error('[ForgotPassword] Firebase error:', err?.error?.message);
    }

    // Always return generic success regardless of outcome
    res.status(HttpStatusCodes.OK).json(genericSuccess);
  } catch (error) {
    console.error('[ForgotPassword] Error:', error);
    res.status(HttpStatusCodes.OK).json(genericSuccess);
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default {
  login,
  createUser,
  getCurrentUser,
  register,
  forgotPassword,
} as const;
