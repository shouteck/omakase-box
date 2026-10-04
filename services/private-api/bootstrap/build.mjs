import { fileURLToPath } from 'node:url';
import { build } from 'vite';

for (const entry of ['src/bootstrap/main.ts', 'bootstrap/owner-cli.ts', 'bootstrap/owner-store.ts', 'db/migrate.ts', 'db/intent-store.ts', 'auth/fixture.ts', 'requests/intake-fixture.ts', 'intents/session-fixture.ts']) {
  await build({ root: fileURLToPath(new URL('../', import.meta.url)), build: { ssr: entry, outDir: 'dist', emptyOutDir: false, sourcemap: false } });
}
