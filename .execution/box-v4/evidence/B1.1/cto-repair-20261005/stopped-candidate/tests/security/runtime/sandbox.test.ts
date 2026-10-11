import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
// @ts-expect-error guest-side ESM module without type declarations
import { buildSandboxSpec, cgroupBudget, mountTable, launchArgv, innerCommand, ENVIRONMENT, DEVICE_NODES, SandboxSpecRejected } from '../../../infra/runner/jobs/harness/sandbox-spec.mjs';

const HASH = 'a'.repeat(64);
const job = {
  protocolVersion: 1, jobId: '11111111-1111-4111-8111-111111111111', attemptId: '22222222-2222-4222-8222-222222222222',
  jobKind: 'public', profile: 'dedicated-linux-kvm-fresh-vm', packageHash: HASH, submissionHash: 'b'.repeat(64),
  artifactHash: 'c'.repeat(64), imageDigest: 'sha256:' + 'd'.repeat(64), harnessId: 'pure-module/v1', harnessDigest: 'e'.repeat(64),
  requiredCheckIds: ['rank.order'], deadline: 1800000120000,
  limits: { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 },
};

describe('sandbox launch spec — fixed enforcement shape', () => {
  it('rejects non-canonical jobs', () => {
    expect(() => buildSandboxSpec({ ...job, limits: { ...job.limits, memoryMiB: 1024 } })).toThrow(SandboxSpecRejected);
    expect(() => buildSandboxSpec({ ...job, deadline: -1 })).toThrow(SandboxSpecRejected);
    expect(() => buildSandboxSpec(null)).toThrow(SandboxSpecRejected);
  });
  it('cgroup budget pins cpu, memory, swap and pids to the job limits', () => {
    expect(cgroupBudget(job)).toMatchObject({
      name: 'private-task-11111111-1111-4111-8111-111111111111',
      'cpu.max': 'max 200000',
      'memory.max': '536870912',
      'memory.swap.max': '0',
      'pids.max': '128',
    });
  });
  it('mount table is exactly bounded tmpfs plus read-only proc/dev', () => {
    const mounts = mountTable(job) as { options: string; target: string }[];
    expect(mounts.map(entry => entry.target)).toEqual(['/work', '/tmp', '/proc', '/dev']);
    for (const entry of mounts) {
      expect(entry.options).toContain('nodev');
      expect(entry.options).toContain('nosuid');
      expect(entry.options).toContain('noexec');
    }
    expect(mounts[0]!.options).toContain('size=234881024');
    expect(mounts[1]!.options).toContain('size=33554432');
  });
  it('devices are only null/zero/urandom — no control port, no host device', () => {
    expect((DEVICE_NODES as { path: string }[]).map(node => node.path).sort()).toEqual(['/dev/null', '/dev/urandom', '/dev/zero']);
  });
  it('environment is scrubbed to four fixed assignments', () => {
    expect(ENVIRONMENT).toEqual(['PATH=/usr/local/bin', 'LANG=C', 'HOME=/work', 'TMPDIR=/tmp']);
  });
  it('launch argv contains no candidate-derived bytes', () => {
    const argv = launchArgv(job);
    expect(argv[0]).toBe('/usr/bin/unshare');
    expect(argv).toContain('--user');
    expect(argv).toContain('--map-root-user');
    expect(argv).toContain('--pid');
    expect(argv).toContain('--ipc');
    expect(argv).toContain('--uts');
    expect(argv).toContain('--mount');
    expect(argv).toContain('--kill-child');
    expect(argv[argv.length - 1]).toBe('/opt/private-task/harness/container-init');
    expect(JSON.stringify(argv)).not.toContain('candidate');
  });
  it('inner command drops privileges and pins every rlimit', () => {
    const inner = innerCommand(job);
    expect(inner.drop).toEqual(['/usr/bin/setpriv', '--reuid=1000', '--regid=1000', '--clear-groups', '--no-new-privs']);
    expect(inner.limits).toEqual(['/usr/bin/prlimit', '--cpu=120', '--as=536870912', '--nproc=128', '--fsize=1048576', '--nofile=64', '--locks=0', '--sigpending=64']);
    expect(inner.command).toEqual(['/usr/local/bin/node', '/work/tooling/worker.mjs']);
  });
  it('the signed channel and result key are declared unreachable', () => {
    const spec = buildSandboxSpec(job);
    expect(spec.controlChannel).toEqual({ name: 'org.private-task.control', accessibleToCandidate: false });
    expect(spec.signing).toEqual({ keyPath: '/opt/private-task/harness/result-key.pem', accessibleToCandidate: false });
    expect(spec.network).toBe('none');
    expect(spec.readOnlyRoot).toBe(true);
  });
});

describe('container-init script — cross-checked against the spec', () => {
  it('applies rprivate propagation, ro root, bounded tmpfs, ro binds and the fixed inner argv', async () => {
    const script = await readFile('infra/runner/jobs/harness/container-init', 'utf8');
    expect(script).toContain('--make-rprivate /');
    expect(script).toContain('remount,ro,bind /');
    expect(script).toContain('size=234881024');
    expect(script).toContain('size=33554432');
    expect(script).toContain('/var/private-task/staging/candidate /work/candidate');
    expect(script).toContain('--bind -o ro');
    expect(script).toContain('--reuid=1000');
    expect(script).toContain('--no-new-privs');
    expect(script).toContain('--cpu=120 --as=536870912 --nproc=128 --fsize=1048576 --nofile=64 --locks=0 --sigpending=64');
    expect(script).toContain('/work/tooling/worker.mjs');
    // No command/parameter substitution may appear on any exec line — the
    // only shell variable allowed is the fixed-device loop iterator.
    for (const line of script.split('\n').filter(line => /\bexec\b|mount|prlimit|setpriv/.test(line))) {
      expect(line).not.toMatch(/\$\{|\$\(|`/);
      expect(line.replaceAll('$dev', '')).not.toMatch(/\$\w/);
    }
  });
  it('private /dev contains no virtio or host device exposure', async () => {
    const script = await readFile('infra/runner/jobs/harness/container-init', 'utf8');
    const devLoop = script.split('\n').filter(line => /for dev in|\/dev\//.test(line));
    expect(devLoop.join('\n')).toContain('null zero urandom');
    expect(script).not.toMatch(/virtio-ports\/|\/dev\/kvm|\/dev\/net|\/dev\/vda/);
  });
});
