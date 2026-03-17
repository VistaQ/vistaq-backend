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

/******************************************************************************
                        Per-Layer Error Handlers
******************************************************************************/

/**
 * Logs the error and rethrows it wrapped in a RepositoryError.
 * Call this in every Repository catch block.
 *
 * @param context - Identifies the method, e.g. 'UserRepository.findById'.
 * @param error   - The caught error.
 */
export function handleRepositoryError(context: string, error: unknown): never {
  loggingService.error(`${context} failed`, error);
  throw new RepositoryError(`${context} failed`, error);
}

/**
 * Logs the error and rethrows it wrapped in a ServiceError.
 * Call this in every Service catch block.
 *
 * @param context - Identifies the method, e.g. 'UserService.getById'.
 * @param error   - The caught error.
 */
export function handleServiceError(context: string, error: unknown): never {
  loggingService.error(`${context} failed`, error);
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

  // Configure Sentry scope with root cause fingerprinting and severity level.
  // next() is called inside the callback so the scope is active when the error
  // propagates to Sentry's error handler.
  Sentry.withScope((scope) => {
    const correlationId = asyncLocalStorage.getStore()?.correlationId;
    if (correlationId) {
      scope.setExtra('correlationId', correlationId);
    }

    const rootCause = getRootCause(error);
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
