import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './process.mjs';

export function dockerExecutable() {
  const local = process.platform === 'win32' && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe') : null;
  return local && existsSync(local) ? local : 'docker';
}
export const dockerContext = process.platform === 'win32' ? 'desktop-linux' : 'default';
export function docker(args, { input, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerExecutable(), ['--context', dockerContext, ...args], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Trusted Docker operation timed out.')); }, timeout);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(0, 262144); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(0, 262144); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
