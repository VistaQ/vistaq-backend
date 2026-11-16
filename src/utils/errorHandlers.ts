import type { NextFunction } from 'express';

import {
  ControllerError,
  RepositoryError,
  ServiceError,
} from '@src/models/errors/layer.errors';

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
 * Wraps the error in a ControllerError and forwards it to the
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
  next(new ControllerError(`${context} failed`, error));
}
