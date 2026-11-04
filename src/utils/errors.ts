/**
 * Walks the error cause chain and returns the deepest (root) cause.
 */
export function getRootCause(error: unknown): unknown {
  let current = error;
  while (
    current instanceof Error &&
    (current as unknown as { cause?: unknown }).cause instanceof Error
  ) {
    current = (current as unknown as { cause: Error }).cause;
  }
  return current;
}
