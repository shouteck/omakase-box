import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = fileURLToPath(new URL('./tooling/node_modules/pnpm/bin/pnpm.cjs', import.meta.url));
if (!existsSync(entry)) {
  console.error('Repository-local pnpm is unavailable. Run npm ci --prefix scripts/tooling --ignore-scripts.');
  process.exit(2);
}
const args = process.argv.slice(2);
const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const invocation = Object.hasOwn(scripts, args[0] ?? '') ? ['--silent', 'run', ...args] : args;
const child = spawn(process.execPath, [entry, ...invocation], { cwd: root, stdio: 'inherit' });
child.on('error', () => process.exit(2));
child.on('exit', code => process.exit(code ?? 1));
