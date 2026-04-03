import { NextFunction } from 'express';
import * as Sentry from '@sentry/node';

import {
  ControllerError,
  RepositoryError,
  ServiceError,
} from '@src/models/errors/layer.errors';
import { RouteError } from '@src/models/errors/route.error';
import loggingService, { asyncLocalStorage } from '@src/services/logging.service';
import { getRootCause } from '@src/utils/sentry.utils';
import { emitErrorCount } from '@src/utils/sentry.metrics';

/******************************************************************************
                        Per-Layer Error Handlers
******************************************************************************/

/**
 * Wraps the error in a RepositoryError and rethrows.
 * Call this in every Repository catch block.
 *
 * @param context - Identifies the method, e.g. 'UserRepository.findById'.
 * @param error   - The caught error.
 */
export function handleRepositoryError(context: string, error: unknown): never {
  throw new RepositoryError(`${context} failed`, error);
}

/**
 * Wraps the error in a ServiceError and rethrows.
 * Call this in every Service catch block.
 *
 * @param context - Identifies the method, e.g. 'UserService.getById'.
 * @param error   - The caught error.
 */
export function handleServiceError(context: string, error: unknown): never {
  throw new ServiceError(`${context} failed`, error);
}

/**
 * Logs the error, wraps it in a ControllerError, and forwards it to the
 * centralised Express error-handling middleware via next().
 * Call this in every Controller catch block.
 *
 * Also configures Sentry scope with fingerprinting and level based on the
 * root cause error, so Sentry groups and classifies events accurately.
 *
 * @param context - Identifies the method, e.g. 'UserController.getById'.
 * @param error   - The caught error.
 * @param next    - Express NextFunction from the route handler.
 */
export function handleControllerError(
  context: string,
  error: unknown,
  next: NextFunction,
): void {
  loggingService.error(`${context} failed`, error);

  const rootCause = getRootCause(error);
  const errorType = rootCause instanceof Error ? rootCause.constructor.name : 'UnknownError';
  emitErrorCount(errorType, context);

  // Configure Sentry scope with root cause fingerprinting and severity level.
  // next() is called inside the callback so the scope is active when the error
  // propagates to Sentry's error handler.
  Sentry.withScope((scope) => {
    const correlationId = asyncLocalStorage.getStore()?.correlationId;
    if (correlationId) {
      scope.setExtra('correlationId', correlationId);
    }

    if (rootCause instanceof RouteError) {
      scope.setFingerprint([rootCause.constructor.name, String(rootCause.status), rootCause.message]);
      scope.setLevel(rootCause.status >= 500 ? 'error' : 'warning');
    } else if (rootCause instanceof Error) {
      scope.setFingerprint([rootCause.constructor.name, rootCause.message]);
      scope.setLevel('error');
    }

    next(new ControllerError(`${context} failed`, error));
  });
}
