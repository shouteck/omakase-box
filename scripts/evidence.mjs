import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './process.mjs';

const [taskId, label, ...args] = process.argv.slice(2);
if (!/^M\d+\.\d+$/.test(taskId ?? '') || !/^[a-z0-9-]+$/.test(label ?? '') || args.length === 0) process.exit(2);
const start = new Date().toISOString();
const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let output = '';
let truncated = false;
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  const text = chunk.toString();
  if (output.length + text.length > 262144) truncated = true;
  output = (output + text).slice(0, 262144);
  process.stdout.write(text);
});
const code = await new Promise(resolve => {
  child.on('error', () => resolve(2));
  child.on('exit', value => resolve(value ?? 1));
});
const directory = join(root, '.execution', 'evidence', taskId);
await mkdir(directory, { recursive: true });
await writeFile(join(directory, `${label}.json`), JSON.stringify({
  schemaVersion: 1, taskId, assurance: code === 0 && !truncated ? 'tested' : 'unverified',
  command: [process.execPath, ...args], workingDirectory: root, startedAt: start,
  finishedAt: new Date().toISOString(), exitCode: code, truncated, output
}, null, 2) + '\n', { flag: 'wx' });
process.exitCode = code;
