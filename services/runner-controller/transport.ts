import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunnerConfigSchema } from './config.js';
import type { RunnerConfig } from './config.js';

export interface ProcessSpec { executable: 'ssh' | 'sftp'; args: readonly string[]; input: string; timeoutMs: number; maxOutputBytes: number }
export type ProcessExecutor = (spec: ProcessSpec) => Promise<string>;
export const executeBounded: ProcessExecutor = spec => new Promise((resolve, reject) => {
  const child = spawn(spec.executable, [...spec.args], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; let count = 0; let failed = false;
  function fail() { if (!failed) { failed = true; child.kill(); reject(new Error('Runner transport unavailable.')); } }
  const timer = setTimeout(fail, spec.timeoutMs);
  child.on('error', fail);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk: Buffer) => { count += chunk.length; if (count > spec.maxOutputBytes) fail(); else if (stream === child.stdout) output += chunk.toString('utf8'); });
  child.on('close', code => { clearTimeout(timer); if (code !== 0) fail(); else if (!failed) resolve(output); });
  child.stdin.on('error', fail);
  child.stdin.end(spec.input);
});
export interface BrokerTransport { request(input: unknown): Promise<unknown>; upload(jobId: string, bytes: Buffer): Promise<void> }
const broker = '/opt/private-task/broker/broker.py';
function safePath(value: string) { if (/[\r\n\0]/.test(value)) throw new Error('Invalid operator path.'); return value; }
export class SshBrokerTransport implements BrokerTransport {
  private readonly config: RunnerConfig;
  constructor(input: unknown, private readonly execute: ProcessExecutor = executeBounded) { this.config = RunnerConfigSchema.parse(input); safePath(this.config.identityFile); safePath(this.config.knownHostsFile); }
  private options() { return ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes', '-o', 'ConnectTimeout=5', '-o', 'IdentitiesOnly=yes', '-o', 'UserKnownHostsFile=' + this.config.knownHostsFile, '-i', this.config.identityFile]; }
  async request(input: unknown) {
    const text = JSON.stringify(input);
    if (Buffer.byteLength(text) > 262144) throw new Error('Broker request exceeded bounds.');
    const output = await this.execute({ executable: 'ssh', args: [...this.options(), this.config.user + '@' + this.config.host, broker], input: text, timeoutMs: 135000, maxOutputBytes: 1048576 });
    return JSON.parse(output);
  }
  async upload(jobId: string, bytes: Buffer) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(jobId) || bytes.length > 16777216) throw new Error('Invalid bounded transfer.');
    const directory = await mkdtemp(join(tmpdir(), 'private-task-approved-'));
    const local = join(directory, 'artifact.bin');
    try {
      await writeFile(local, bytes, { mode: 0o600, flag: 'wx' });
      const quoted = local.replaceAll('\\', '/').replaceAll('"', '\\"');
      await this.execute({ executable: 'sftp', args: [...this.options(), '-b', '-', this.config.user + '@' + this.config.host], input: `put "${quoted}" /var/lib/private-task/staging/${jobId}.bin\n`, timeoutMs: 30000, maxOutputBytes: 65536 });
    } finally { await rm(local, { force: true }); await rmdir(directory); }
  }
}
