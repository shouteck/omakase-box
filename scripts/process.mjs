import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function developmentEnvironment(input = process.env) {
  const allowed = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];
  return { ...Object.fromEntries(allowed.filter(key => input[key] !== undefined).map(key => [key, input[key]])), SYNTHETIC_BOOTSTRAP_ONLY: 'true' };
}
export function runNode(entry, args = [], options = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [entry, ...args], { cwd: root, stdio: 'inherit', ...options });
    child.on('error', () => resolve(2));
    child.on('exit', code => resolve(code ?? 1));
  });
}
export function probe(command, args = [], timeout = 3000) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let output = '';
    const timer = setTimeout(() => { child.kill(); resolve({ available: false, reason: 'timeout' }); }, timeout);
    child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(0, 16384); });
    child.on('error', () => { clearTimeout(timer); resolve({ available: false, reason: 'not_found' }); });
    child.on('exit', code => { clearTimeout(timer); resolve({ available: code === 0, code, output }); });
  });
}
