import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { RouteError } from '@src/models/errors/route.error';
import loggingService from '@src/services/logging.service';
import supabaseService from '@src/services/supabase.service';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Auth Middleware
******************************************************************************/

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    loggingService.debug('Authenticating request');

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    const token = authHeader.slice(7);

    // Verify the token via Supabase — handles ES256/HS256 algorithm automatically
    const { data, error } = await supabaseService.verifyToken(token);
    if (error || !data.user) {
      loggingService.error(
        'Token verification failed',
        error ?? new Error('No user returned'),
      );
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    // Decode (no re-verification needed) to extract custom claims
    const decoded = jwt.decode(token) as Record<string, unknown> | null;
    if (!decoded) {
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    const userId = decoded['user_id'];
    const tenantId = decoded['tenant_id'];
    const role = decoded['app_role']; // custom app role — not Supabase's built-in "authenticated"
    const groupId = decoded['group_id'] ?? null;

    if (
      typeof userId !== 'string' ||
      typeof tenantId !== 'string' ||
      typeof role !== 'string'
    ) {
      loggingService.error('Token missing required custom claims', undefined, {
        userId,
        tenantId,
        role,
      });
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    if (groupId !== null && typeof groupId !== 'string') {
      loggingService.error('Token contains invalid group_id claim', undefined, {
        groupId,
      });
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    req.user = { id: userId, tenant_id: tenantId, role, group_id: groupId as string | null };

    next();
  } catch (error) {
    loggingService.error('Authentication failed', error);
    next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
    return;
  }
}
