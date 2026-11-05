import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const noRepositoryImports = {
  patterns: [
    {
      group: ['**/repositories/**'],
      message: 'Only services may use repositories.',
    },
  ],
};

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '.serverless/**',
    'supabase/functions/**',
    'src/types/database.types.ts',
  ]),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read config through src/utils/env.ts.',
        },
      ],
      // Lambda freezes after the response, so an unawaited promise is dropped work.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  {
    files: [
      'src/controllers/**/*.ts',
      'src/routes/**/*.ts',
      'src/middleware/**/*.ts',
      'src/handlers/**/*.ts',
    ],
    rules: { 'no-restricted-imports': ['error', noRepositoryImports] },
  },
  {
    files: ['src/main.ts', 'src/app.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/utils/env.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  eslintConfigPrettier,
]);
