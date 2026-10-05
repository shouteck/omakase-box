import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const verificationProfile = process.env.BOX_VERIFICATION_PROFILE === 'w002-b11-environment-first-r4';

export default defineConfig({
  // Task-owned writable cache; dependencies stay mounted read-only. Installed
  // Vitest derives its test cache from Vite cacheDir when no override is set.
  ...(verificationProfile ? { cacheDir: fileURLToPath(new URL('../.cto-r1-evidence/vitest-cache/', import.meta.url)) } : {}),
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['.runtime/**', '**/dist/**', '**/node_modules/**'],
    maxWorkers: 1,
    testTimeout: 30000,
    // Optional constrained verification profile only; default runs keep the
    // original implicit hook timeout unchanged.
    ...(verificationProfile ? { hookTimeout: 60000 } : {})
  }
});
