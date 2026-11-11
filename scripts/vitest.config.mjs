import { defineConfig } from 'vitest/config';
import { testTimeoutMs } from './test-timeout.mjs';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['.runtime/**', '**/dist/**', '**/node_modules/**'],
    maxWorkers: 1,
    // K59: 60 s on Windows, 30 s elsewhere; the rule and its reason are in test-timeout.mjs.
    testTimeout: testTimeoutMs(),
    // No test run may tell the live board anything; children inherit this. A test names its own board in settings.
    env: { BOX_BOARD_DEFAULT: '' }
  }
});
