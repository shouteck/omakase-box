import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { developmentEnvironment, root } from './process.mjs';

const entries = ['private-api', 'external-api'].map(service => fileURLToPath(new URL(`../services/${service}/dist/main.js`, import.meta.url)));
if (!entries.every(existsSync)) {
  console.error('Build the trusted bootstrap services first with pnpm build.');
  process.exit(2);
}
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const commands = [
  ...entries.map(entry => [entry]),
  [vite, 'apps/private-console', '--host', '127.0.0.1', '--port', '3000', '--strictPort'],
  [vite, 'apps/contributor-portal', '--host', '127.0.0.1', '--port', '3001', '--strictPort']
];
const children = commands.map(args => spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: developmentEnvironment() }));
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
console.log('Foundation demo only: no accounts, approvals, model, DB workflow or evaluation. No candidate code is executed.');
console.log('Private: http://private.localhost:3000 | Contributor: http://contributor.localhost:3001');
