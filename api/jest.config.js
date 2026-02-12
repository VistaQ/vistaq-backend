/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',

  // Skip full type-checking (mirrors how ts-node runs the app in dev)
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],

  // Load env variables before tests run
  globalSetup: '<rootDir>/tests/global-setup.ts',

  // Resolve path aliases (mirrors tsconfig baseUrl + paths)
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^middleware/(.*)$': '<rootDir>/middleware/$1',
  },

  // Silence console output during tests (remove if you want logs)
  silent: false,

  // Give integration tests (real Firebase calls) more time
  testTimeout: 30000,
};
