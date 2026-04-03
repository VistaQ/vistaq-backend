import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import n from 'eslint-plugin-n';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // global ignores
  globalIgnores([
    '**/dist/**',
    'supabase/functions/**',
    'api/**/*.js',                  // Vercel serverless build artifact
    'src/types/database.types.ts',  // Supabase CLI generated file
  ]),
  // linting rules (code quality only)
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      n,
    },
    rules: {
      // code quality / correctness
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-console': 'warn',
      'no-extra-boolean-cast': 'off',
      'no-process-env': 'warn',
      // node correctness
      'n/no-extraneous-import': 'error'
    },
  },
  // Supabase SDK generic methods require `as never` casts when table name is a
  // generic parameter — known SDK limitation, not a code smell.
  {
    files: ['src/services/supabase.service.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  // Repository layer must cast Supabase response.data (generic arrays) to
  // specific row types via `as unknown as RowType` — typed bridge between SDK
  // generics and domain models.
  {
    files: ['src/repositories/*.repository.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  // Express 5 natively catches rejected promises from async route handlers.
  // `req as unknown as IReq` casts are safe — Zod validates upstream.
  {
    files: ['src/routes/*.routes.ts'],
    rules: {
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  // This IS the centralized env module — process.env access is intentional.
  {
    files: ['src/utils/env.ts'],
    rules: {
      'no-process-env': 'off',
    },
  },
  // main.ts: bootstrap before Pino is initialised. app.ts: catch-block fallback
  // where the structured logger itself may have failed.
  {
    files: ['src/main.ts', 'src/app.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Test files have different type-safety concerns, use require() for
  // dynamically-pathed JSON, and Jest's expect() patterns trigger unbound-method.
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-process-env': 'off',
    },
  },
  // Standalone scripts: console output and process.env access are intentional.
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-process-env': 'off',
    },
  },
  // MUST be last — disables ALL formatting rules
  eslintConfigPrettier,
]);
