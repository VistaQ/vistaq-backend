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

interface ITokenIdentity {
  subject: string;
  issuedAt: number;
}

// Behind the gateway the authorizer has already verified the token; anywhere
// else (local development) it is verified here with the same pool and client.
async function identityOf(req: Request): Promise<ITokenIdentity | null> {
  const claims = req.apiGateway?.event.requestContext.authorizer?.jwt?.claims;
  if (claims) {
    return typeof claims.sub === 'string'
      ? { subject: claims.sub, issuedAt: Number(claims.iat) }
      : null;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  verifier ??= createVerifier();
  const payload = await verifier.verify(authHeader.slice(7));
  return { subject: payload.sub, issuedAt: payload.iat };
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const identity = await identityOf(req);
    if (!identity) {
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    const user = await authService.getUserContext(identity.subject);
    if (!user) {
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    // The gateway authorizer cannot see revocation, so logout stamps the user and tokens issued before it die here.
    if (user.signed_out_at) {
      const signedOutSeconds = Math.floor(Date.parse(user.signed_out_at) / 1000);
      if (!(identity.issuedAt > signedOutSeconds)) {
        next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
        return;
      }
    }

    if (user.status !== 'active') {
      next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Account is inactive'));
      return;
    }

    if (!user.role) {
      next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    req.user = {
      id: user.id,
      role: user.role,
      group_id: user.group_id,
    };

    next();
  } catch {
    next(new RouteError(HttpStatusCodes.UNAUTHORIZED, 'Unauthorized'));
  }
}
