/**
 * Pure launch-spec builder for the constrained candidate container inside the
 * dedicated guest. The supervisor materializes this spec with fixed
 * util-linux/cgroup primitives; this module is deliberately data-only so the
 * exact enforcement surface can be reviewed and tested without executing
 * anything. All argv arrays are fixed-shape — no candidate byte ever becomes
 * part of an executable, option or mount source.
 */
export const CONTAINER_USER = Object.freeze({ name: 'pwuser', uid: 1000, gid: 1000 });
export const CONTROL_PORT_NAME = 'org.private-task.control';
export const CGROUP_ROOT = '/sys/fs/cgroup';
export const WORKER_ENTRY = '/work/tooling/worker.mjs';
export const BUILD_ENTRY = '/work/tooling/build.mjs';
export const NODE_EXECUTABLE = '/usr/local/bin/node';
export const RESULT_KEY_PATH = '/opt/private-task/harness/result-key.pem';
export const CANDIDATE_ROOT = '/work/candidate';

export class SandboxSpecRejected extends Error {
  constructor(code) {
    super(code);
    this.name = 'SandboxSpecRejected';
    this.code = code;
  }
}

function validJob(job) {
  return job !== null && typeof job === 'object' && !Array.isArray(job)
    && Number.isSafeInteger(job.deadline) && job.deadline > 0
    && job.limits !== null && typeof job.limits === 'object'
    && job.limits.cpus === 2 && job.limits.memoryMiB === 512 && job.limits.pids === 128
    && job.limits.seconds === 120 && job.limits.logBytes === 1048576 && job.limits.writableMiB === 256;
}

/**
 * cgroup v2 budget the supervisor applies before launch. Writes happen
 * outside the candidate mount namespace; the candidate cannot widen them.
 */
export function cgroupBudget(job) {
  if (!validJob(job)) throw new SandboxSpecRejected('invalid_job');
  const limits = job.limits;
  return Object.freeze({
    name: `private-task-${job.jobId}`,
    controllers: Object.freeze(['cpu', 'memory', 'pids']),
    'cpu.max': Object.freeze(`max ${100000 * limits.cpus}`),
    'memory.max': Object.freeze(String(limits.memoryMiB * 1048576)),
    'memory.swap.max': Object.freeze('0'),
    'pids.max': Object.freeze(String(limits.pids)),
    observations: Object.freeze({
      peakBytes: 'memory.peak',
      oomKills: 'memory.events',
      pidsPeak: 'pids.peak',
    }),
  });
}

/**
 * Tmpfs mounts materialized inside the private mount namespace before the
 * candidate starts. nodev/nosuid/noexec/size are enforcement, not decoration.
 */
export function mountTable(job) {
  if (!validJob(job)) throw new SandboxSpecRejected('invalid_job');
  const workBytes = (job.limits.writableMiB - 32) * 1048576;
  const tmpBytes = 32 * 1048576;
  return Object.freeze([
    Object.freeze({ target: '/work', source: 'tmpfs', type: 'tmpfs', options: `rw,nodev,nosuid,noexec,size=${workBytes},uid=${CONTAINER_USER.uid},gid=${CONTAINER_USER.gid},mode=0700` }),
    Object.freeze({ target: '/tmp', source: 'tmpfs', type: 'tmpfs', options: `rw,nodev,nosuid,noexec,size=${tmpBytes},uid=${CONTAINER_USER.uid},gid=${CONTAINER_USER.gid},mode=0700` }),
    Object.freeze({ target: '/proc', source: 'proc', type: 'proc', options: 'ro,nodev,nosuid,noexec' }),
    Object.freeze({ target: '/dev', source: 'tmpfs', type: 'tmpfs', options: 'rw,nodev,nosuid,noexec,size=65536,mode=0755' }),
  ]);
}

/** Minimal device nodes the candidate may see. No virtio-ports, no host devices. */
export const DEVICE_NODES = Object.freeze([
  Object.freeze({ path: '/dev/null', major: 1, minor: 3, mode: 0o666 }),
  Object.freeze({ path: '/dev/zero', major: 1, minor: 5, mode: 0o666 }),
  Object.freeze({ path: '/dev/urandom', major: 1, minor: 9, mode: 0o666 }),
]);

/** Scrubbed environment: nothing inherited from the supervisor or guest. */
export const ENVIRONMENT = Object.freeze([
  'PATH=/usr/local/bin',
  'LANG=C',
  'HOME=/work',
  'TMPDIR=/tmp',
]);

/**
 * The fixed outer/inner argv. `unshare` creates user+pid+ipc+uts+mount
 * namespaces with root mapped to the unprivileged guest user; inside, the
 * init script applies mounts/devices and drops to pwuser via setpriv, then
 * prlimit pins the remaining rlimits around the Node worker.
 */
/**
 * The fixed outer argv plus the embedded inner command line. `unshare`
 * creates user+pid+ipc+uts+mount namespaces with root mapped to the
 * unprivileged guest user; container-init applies mounts/devices/read-only
 * root and then execs the embedded setpriv+prlimit+worker line. The inner
 * values are the protocol's pinned literals — container-init embeds the same
 * constants, and the test suite cross-checks both stay in agreement.
 */
export function innerCommand(job) {
  if (!validJob(job)) throw new SandboxSpecRejected('invalid_job');
  const limits = job.limits;
  return Object.freeze({
    drop: Object.freeze(['/usr/bin/setpriv', `--reuid=${CONTAINER_USER.uid}`, `--regid=${CONTAINER_USER.gid}`, '--clear-groups', '--no-new-privs']),
    limits: Object.freeze(['/usr/bin/prlimit', `--cpu=${limits.seconds}`, `--as=${limits.memoryMiB * 1048576}`, `--nproc=${limits.pids}`, '--fsize=1048576', '--nofile=64', '--locks=0', '--sigpending=64']),
    command: Object.freeze([NODE_EXECUTABLE, WORKER_ENTRY]),
  });
}

export function launchArgv(job) {
  if (!validJob(job)) throw new SandboxSpecRejected('invalid_job');
  return Object.freeze([
    '/usr/bin/unshare',
    '--user',
    '--map-root-user',
    '--pid',
    '--ipc',
    '--uts',
    '--mount',
    '--fork',
    '--kill-child',
    '--mount-proc',
    '/opt/private-task/harness/container-init',
  ]);
}

/**
 * Complete launch plan handed to the spawner. Everything enumerable is
 * either a fixed literal or derived from the job's own approved limits.
 */
export function buildSandboxSpec(job) {
  return Object.freeze({
    cgroup: cgroupBudget(job),
    mounts: mountTable(job),
    devices: DEVICE_NODES,
    environment: ENVIRONMENT,
    argv: launchArgv(job),
    inner: innerCommand(job),
    network: 'none',
    readOnlyRoot: true,
    workingDirectory: '/work',
    controlChannel: Object.freeze({ name: CONTROL_PORT_NAME, accessibleToCandidate: false }),
    signing: Object.freeze({ keyPath: RESULT_KEY_PATH, accessibleToCandidate: false }),
    writableBudgetBytes: job.limits.writableMiB * 1048576,
    logBudgetBytes: job.limits.logBytes,
    wallDeadlineMs: job.deadline,
  });
}
