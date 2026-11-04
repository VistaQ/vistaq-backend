import {
  ControllerError,
  RepositoryError,
  ServiceError,
} from '@src/models/errors/layer.errors';
import {
  handleControllerError,
  handleRepositoryError,
  handleServiceError,
} from '@src/utils/errorHandlers';
import { getRootCause } from '@src/utils/errors';

describe('getRootCause', () => {
  it('returns the error itself when it has no cause', () => {
    const error = new Error('plain');

    expect(getRootCause(error)).toBe(error);
  });

  it('returns the deepest cause of a chain', () => {
    const root = new Error('root');
    const chain = new ServiceError('service failed', new RepositoryError('repo failed', root));

    expect(getRootCause(chain)).toBe(root);
  });

  it('returns a non-Error value unchanged', () => {
    expect(getRootCause('boom')).toBe('boom');
  });
});

describe('per-layer error handlers', () => {
  it('handleRepositoryError wraps and rethrows with the original as cause', () => {
    const original = new Error('db down');

    expect(() => handleRepositoryError('UserRepository.findById', original)).toThrow(
      RepositoryError,
    );
    try {
      handleRepositoryError('UserRepository.findById', original);
    } catch (error) {
      expect((error as Error).message).toBe('UserRepository.findById failed');
      expect(getRootCause(error)).toBe(original);
    }
  });

  it('handleServiceError wraps and rethrows with the original as cause', () => {
    const original = new Error('repo failed');

    expect(() => handleServiceError('UserService.getById', original)).toThrow(
      ServiceError,
    );
  });

  it('handleControllerError forwards a ControllerError to next with the original as cause', () => {
    const next = jest.fn();
    const original = new Error('service failed');

    handleControllerError('UserController.getById', original, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwarded = next.mock.calls[0][0] as ControllerError;
    expect(forwarded).toBeInstanceOf(ControllerError);
    expect(forwarded.message).toBe('UserController.getById failed');
    expect(getRootCause(forwarded)).toBe(original);
  });
});
