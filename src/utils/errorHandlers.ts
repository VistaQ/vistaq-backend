import { NextFunction } from 'express';

import {
  ControllerError,
  RepositoryError,
  ServiceError,
} from '@src/models/errors/layer.errors';
import loggingService from '@src/services/logging.service';

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
  next(new ControllerError(`${context} failed`, error));
}
