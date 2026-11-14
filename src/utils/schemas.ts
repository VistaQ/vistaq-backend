import { z } from 'zod';

// Cognito subs are 8-4-4-4-12 hex without RFC 4122 version and variant bits,
// so z.uuid() rejects real user ids.
export const userIdSchema = z.guid();
