import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['.runtime/**', '**/dist/**', '**/node_modules/**'],
    maxWorkers: 1,
    testTimeout: 30000,
    // No test run may tell the live board anything; children inherit this. A test names its own board in settings.
    env: { BOX_BOARD_DEFAULT: '' }
  }
});
