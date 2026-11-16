import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@src': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/setEnv.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reportOnFailure: true,
    },
  },
});
