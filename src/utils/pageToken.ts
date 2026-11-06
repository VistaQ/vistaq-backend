export function encodePageToken(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** The decoded token, or undefined when it is not valid base64url JSON. */
export function decodePageToken(token: string): unknown {
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}
