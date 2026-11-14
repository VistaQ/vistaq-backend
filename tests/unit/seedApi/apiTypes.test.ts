import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  generateApiTypes,
  TYPES_PATH,
} from '../../../scripts/seed-api/generateApiTypes';

describe('generated API types', () => {
  it('match openapi.yaml; run npm run gen:api after changing the spec', async () => {
    expect(await generateApiTypes()).toBe(readFileSync(TYPES_PATH, 'utf8'));
  }, 30_000);
});
