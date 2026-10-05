import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { runNode } from './process.mjs';

const mode = process.argv[2];
if (!['check', 'build'].includes(mode)) process.exit(2);
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const code = await runNode(tsc, ['--noEmit']);
if (code !== 0) process.exit(code);
const boundaryCode = await runNode(fileURLToPath(new URL('./boundaries.mjs', import.meta.url)));
if (boundaryCode !== 0) process.exit(boundaryCode);
if (mode === 'check') {
  for (const suite of ['bootstrap', 'auth', 'contracts', 'planner']) {
    const result = await runNode(fileURLToPath(new URL('./suite.mjs', import.meta.url)), [suite]);
    if (result !== 0) process.exit(result);
  }
  process.exit(0);
}
for (const service of ['private-api', 'external-api', 'runner-controller']) {
  await build({
    root: fileURLToPath(new URL(`../services/${service}/`, import.meta.url)),
    build: { ssr: service === 'runner-controller' ? 'src/bootstrap/index.ts' : 'src/bootstrap/main.ts', outDir: 'dist', emptyOutDir: false, sourcemap: false }
  });
  const entries = service === 'private-api' ? ['bootstrap/owner-cli.ts', 'bootstrap/owner-store.ts', 'db/migrate.ts', 'db/intent-store.ts'] : service === 'external-api' ? ['db/migrate.ts', 'db/reservation-store.ts'] : [];
  for (const entry of entries) await build({ root: fileURLToPath(new URL(`../services/${service}/`, import.meta.url)), build: { ssr: entry, outDir: 'dist', emptyOutDir: false, sourcemap: false } });
}
await build({ root: fileURLToPath(new URL('../packages/box-cli/', import.meta.url)), build: { ssr: 'src/cli.ts', outDir: 'dist', emptyOutDir: true, sourcemap: false } });
await build({ root: fileURLToPath(new URL('../examples/private-shop/', import.meta.url)), build: { ssr: 'src/server.ts', outDir: 'dist', emptyOutDir: false, sourcemap: false } });
await build({ root: fileURLToPath(new URL('../examples/private-shop/', import.meta.url)), base: './', build: { outDir: 'dist/client', emptyOutDir: false, sourcemap: false } });
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
for (const app of ['private-console', 'contributor-portal']) {
  const result = await runNode(vite, ['build', `apps/${app}`, '--base', './']);
  if (result !== 0) process.exit(result);
}
