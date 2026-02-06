import { NextFunction, Request, Response } from 'express';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import { UserRole } from '@src/types/auth.types';

/******************************************************************************
                            Role-Based Access Control
******************************************************************************/

/**
 * Middleware factory for role-based access control
 *
 * @param allowedRoles - Array of roles that are allowed to access the route
 * @returns Express middleware function
 *
 * @example
 * router.post('/admin-only', requireRole(['admin']), adminController.doSomething);
 * router.get('/staff-only', requireRole(['admin', 'manager']), staffController.doSomething);
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        res.status(HttpStatusCodes.UNAUTHORIZED).json({
          error: 'Authentication required',
        });
        return;
      }

      // Check if user has required role
      if (!allowedRoles.includes(req.user.role)) {
        res.status(HttpStatusCodes.FORBIDDEN).json({
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: req.user.role,
        });
        return;
      }

      // User has required role, proceed
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Middleware to require admin role
 */
export const requireAdmin = requireRole(['admin']);

/**
 * Middleware to require admin or manager role
 */
export const requireAdminOrManager = requireRole(['admin', 'manager']);

/**
 * Middleware to require any staff role (admin, manager, or agent)
 */
export const requireStaff = requireRole(['admin', 'manager', 'agent']);
