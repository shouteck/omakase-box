import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['.runtime/**', '**/dist/**', '**/node_modules/**'],
    maxWorkers: 1,
    testTimeout: 30000,
    // Optional constrained verification profile only; default runs keep the
    // original implicit hook timeout unchanged.
    ...(process.env.BOX_VERIFICATION_PROFILE === 'w002-b11-environment-first-r4' ? { hookTimeout: 60000 } : {})
  }
});
