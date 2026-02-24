import { NextFunction, Request, Response } from 'express';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import { adminAuth, getUserByUid } from '@src/config/firebase';
import { User } from '@src/types/auth.types';

/******************************************************************************
                            Authentication Middleware
******************************************************************************/

/**
 * Verify Firebase ID token and attach user to request
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'No token provided',
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Invalid token format',
      });
      return;
    }

    // Verify token using Firebase Admin SDK
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Fetch user data from Firestore
    const userData = await getUserByUid(uid);

    if (!userData) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'User not found',
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

    // Attach user to request
    req.user = userData as unknown as User;

    // Continue to next middleware
    next();
  } catch (error: unknown) {
    // Handle token verification errors
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string };

      switch (firebaseError.code) {
        case 'auth/id-token-expired':
          res.status(HttpStatusCodes.UNAUTHORIZED).json({
            error: 'Token expired',
          });
          return;

        case 'auth/id-token-revoked':
          res.status(HttpStatusCodes.UNAUTHORIZED).json({
            error: 'Token revoked',
          });
          return;

        case 'auth/invalid-id-token':
        case 'auth/argument-error':
          res.status(HttpStatusCodes.UNAUTHORIZED).json({
            error: 'Invalid token',
          });
          return;

        default:
          console.error('Token verification error:', firebaseError.code);
          res.status(HttpStatusCodes.UNAUTHORIZED).json({
            error: 'Authentication failed',
          });
          return;
      }
    }

    console.error('Authentication error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      next();
      return;
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      next();
      return;
    }

    // Verify token
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Fetch user data
    const userData = await getUserByUid(uid);

    if (userData && userData.status === 'active') {
      req.user = userData as unknown as User;
    }

    next();
  } catch (error) {
    // On error, just continue without user
    console.error('Optional auth error:', error);
    next();
  }
}
