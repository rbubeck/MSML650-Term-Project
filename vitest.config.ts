import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: [
      'frontend/**/*.test.{ts,tsx}',
      'backend/**/*.test.ts',
      'packages/**/*.test.{ts,tsx}',
      'infrastructure/**/*.test.ts',
      'tests/**/*.test.{ts,tsx}',
    ],
    passWithNoTests: true,
    restoreMocks: true,
  },
});
