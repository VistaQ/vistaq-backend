import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { NextFunction, Request, Response } from 'express';

import { RouteError } from '@src/models/errors/route.error';
import authService from '@src/services/auth.service';
import EnvVars from '@src/utils/env';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Auth Middleware
******************************************************************************/

let verifier: ReturnType<typeof createVerifier> | undefined;

function createVerifier() {
  return CognitoJwtVerifier.create({
    userPoolId: EnvVars.CognitoUserPoolId,
    clientId: EnvVars.CognitoClientId,
    tokenUse: 'access',
  });
}

// Behind the gateway the authorizer has already verified the token; anywhere
// else (local development) it is verified here with the same pool and client.
async function subjectOf(req: Request): Promise<string | null> {
  const claims = req.apiGateway?.event.requestContext.authorizer?.jwt?.claims;
  if (claims) {
    return typeof claims.sub === 'string' ? claims.sub : null;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  verifier ??= createVerifier();
  const payload = await verifier.verify(authHeader.slice(7));
  return payload.sub;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const subject = await subjectOf(req);
    if (!subject) {
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    const user = await authService.getUserContext(subject);
    if (!user) {
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    if (user.status !== 'active') {
      next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Account is inactive'));
      return;
    }

    if (!user.role || !user.tenant_id) {
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    req.user = {
      id: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      group_id: user.group_id,
    };

    next();
  } catch {
    next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
  }
}
