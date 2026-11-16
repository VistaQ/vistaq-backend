import { readFileSync } from 'fs';
import openapiTS, { astToString } from 'openapi-typescript';
import { join } from 'path';
import { format, resolveConfig } from 'prettier';

export const SPEC_PATH = join(__dirname, '../../openapi.yaml');
export const TYPES_PATH = join(__dirname, 'api.d.ts');

export async function generateApiTypes(): Promise<string> {
  const ast = await openapiTS(readFileSync(SPEC_PATH, 'utf8'));
  const options = await resolveConfig(TYPES_PATH);
  return format(astToString(ast), { ...options, filepath: TYPES_PATH });
}
