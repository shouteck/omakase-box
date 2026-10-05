import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './process.mjs';

export function dockerExecutable() {
  const local = process.platform === 'win32' && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe') : null;
  return local && existsSync(local) ? local : 'docker';
}
export const dockerContext = process.platform === 'win32' ? 'desktop-linux' : 'default';
// Explicit verification-profile wiring for the environment-first r4 harness.
// The mailbox transport keeps its original validation and fail-closed behavior;
// the named profile additionally binds the run identity and caps the transport
// deadline so relay commands cannot exceed the reviewed ready-profile bound.
// Default Docker behavior (no transport variable) is unchanged; unknown
// transports are still denied.
export const VERIFICATION_PROFILE = 'w002-b11-environment-first-r4';
export const READY_PROFILE_TRANSPORT_DEADLINE_MS = 25000;

export function docker(args, { input, timeout = 120000 } = {}) {
  const transport = process.env.BOX_VERIFICATION_TRANSPORT;
  if (transport !== undefined) {
    if (transport !== 'mailbox') return Promise.reject(new Error('Unknown verification transport.'));
    const mailbox = process.env.BOX_VERIFICATION_MAILBOX;
    // Backslash is the path separator on Windows only; everywhere else it stays rejected.
    const forbidden = process.platform === 'win32' ? /[\0"'`$;|&<>]/ : /[\0"'`$;|&<>\\]/;
    if (typeof mailbox !== 'string' || mailbox.length === 0 || mailbox.length > 512 || mailbox.includes('..') || forbidden.test(mailbox)) return Promise.reject(new Error('Unconfigured verification mailbox.'));
    const profileActive = process.env.BOX_VERIFICATION_PROFILE === VERIFICATION_PROFILE;
    const runId = profileActive ? process.env.BOX_VERIFICATION_RUN_ID : undefined;
    const effectiveTimeout = profileActive ? Math.min(timeout, READY_PROFILE_TRANSPORT_DEADLINE_MS) : timeout;
    return import('./box-verification/fixture-exec-client.mjs').then(module => module.execViaMailbox(args, { input, timeout: effectiveTimeout, mailbox, runId }));
  }
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
