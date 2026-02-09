import { Request, Response } from 'express';
import { FirebaseError } from 'firebase/app';
import { signInWithEmailAndPassword } from 'firebase/auth';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import { adminAuth, clientAuth, db, getUserByUid } from '@src/config/firebase';
import {
  CreateUserRequest,
  CreateUserResponse,
  LoginRequest,
  LoginResponse,
  User,
  UserRole,
} from '@src/types/auth.types';

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

/**
 * Create new user (admin only)
 * POST /api/auth/create-user
 */
async function createUser(req: Request, res: Response): Promise<void> {
  try {
    // Check if requester is admin
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
      groupId,
      groupName,
      agentCode,
      agency,
      location,
    } = req.body as CreateUserRequest;

    // Validate required fields
    if (!email || !password || !name || !role) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Email, password, name, and role are required',
      });
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Password must be at least 6 characters long',
      });
      return;
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'agent', 'viewer'];
    if (!validRoles.includes(role)) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Invalid role. Must be one of: admin, manager, agent, viewer',
      });
      return;
    }

    // Create user in Firebase Auth using Admin SDK
    const userRecord = await adminAuth.createUser({
      email,
      password,
      emailVerified: false,
      disabled: false,
    });

    // Prepare user data for Firestore
    const userData: Omit<User, 'uid'> = {
      email,
      name,
      role,
      groupId: groupId || '',
      groupName: groupName || '',
      agentCode: agentCode || '',
      agency: agency || '',
      location: location || '',
      totalPoints: 0,
      totalProspects: 0,
      totalAppointments: 0,
      totalSales: 0,
      totalACE: 0,
      currentBadge: 'Rookie',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create user document in Firestore
    await db.collection('users').doc(userRecord.uid).set(userData);

    // Prepare response
    const response: CreateUserResponse = {
      success: true,
      userId: userRecord.uid,
      agentCode: agentCode || '',
      message: 'User created successfully',
    };

    res.status(HttpStatusCodes.CREATED).json(response);
  } catch (error) {
    // Handle Firebase Auth errors
    if (error instanceof FirebaseError) {
      switch (error.code) {
        case 'auth/email-already-exists':
          res.status(HttpStatusCodes.CONFLICT).json({
            error: 'Email already exists',
          });
          return;

        case 'auth/invalid-email':
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'Invalid email format',
          });
          return;

        case 'auth/weak-password':
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'Password is too weak',
          });
          return;

        default:
          console.error('Firebase error:', error.code, error.message);
          res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
            error: 'Failed to create user',
          });
          return;
      }
    }

    console.error('Create user error:', error);
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

/******************************************************************************
                                Export
******************************************************************************/

export default {
  login,
  createUser,
  getCurrentUser,
} as const;
