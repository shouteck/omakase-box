import { defineConfig } from 'vitest/config';
import { hookTimeoutMs, testTimeoutMs } from './test-timeout.mjs';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['.runtime/**', '**/dist/**', '**/node_modules/**'],
    maxWorkers: 1,
    // K59: 60 s on Windows, 30 s elsewhere; the rule and its reason are in test-timeout.mjs.
    testTimeout: testTimeoutMs(),
    // K60: the same for a setup hook (30 s on Windows, Vitest's 10 s elsewhere).
    hookTimeout: hookTimeoutMs(),
    // No test run may tell the live board anything; children inherit this. A test names its own board in settings.
    env: { BOX_BOARD_DEFAULT: '' }
  }
});
