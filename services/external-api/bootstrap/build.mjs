import { fileURLToPath } from 'node:url';
import { build } from 'vite';

for (const entry of ['src/bootstrap/main.ts', 'db/migrate.ts', 'db/reservation-store.ts', 'auth/fixture.ts']) {
  await build({ root: fileURLToPath(new URL('../', import.meta.url)), build: { ssr: entry, outDir: 'dist', emptyOutDir: false, sourcemap: false } });
}
