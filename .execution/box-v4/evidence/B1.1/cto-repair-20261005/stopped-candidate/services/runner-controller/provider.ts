import { createHash, randomUUID } from 'node:crypto';
import { parseJob, LeaseSchema } from '../../packages/runner-protocol/index.js';
import type { Job, Lease } from '../../packages/runner-protocol/index.js';
import { RunnerConfigSchema } from './config.js';
import type { BrokerTransport } from './transport.js';

export interface RunnerVmProvider { createFromBaseline(job: Job): Promise<Lease>; execute(job: Job, lease: Lease, bytes: Buffer): Promise<unknown>; destroy(lease: Lease): Promise<void> }
export class DedicatedKvmProvider implements RunnerVmProvider {
  private readonly baselineDigest: string;
  private readonly active = new Map<string, Lease>();
  constructor(config: unknown, private readonly transport: BrokerTransport) { this.baselineDigest = RunnerConfigSchema.parse(config).baselineDigest; }
  async createFromBaseline(job: Job): Promise<Lease> {
    parseJob(job);
    const leaseId = randomUUID();
    const expected: Lease = { leaseId, jobId: job.jobId, baselineDigest: this.baselineDigest, profile: job.profile, status: 'fresh' };
    // Register before RPC; even a lost create response is disposed using its fixed ID.
    this.active.set(leaseId, expected);
    try {
      const lease = LeaseSchema.parse(await this.transport.request({ version: 1, operation: 'create', leaseId, jobId: job.jobId, baselineDigest: this.baselineDigest }));
      if (lease.leaseId !== expected.leaseId || lease.jobId !== expected.jobId || lease.baselineDigest !== expected.baselineDigest || lease.status !== 'fresh') throw new Error('Invalid fresh VM receipt.');
      this.active.set(leaseId, lease);
      return lease;
    } catch {
      try { await this.destroy(expected); } catch { /* Broker retains quarantined lease for operator recovery. */ }
      throw new Error('Fresh VM unavailable.');
    }
  }
  async execute(job: Job, lease: Lease, bytes: Buffer) {
    parseJob(job);
    if (this.active.get(lease.leaseId) !== lease || lease.jobId !== job.jobId || createHash('sha256').update(bytes).digest('hex') !== job.artifactHash) throw new Error('Unknown VM lease or artifact.');
    await this.transport.upload(job.jobId, bytes);
    return this.transport.request({ version: 1, operation: 'run', leaseId: lease.leaseId, job });
  }
  async destroy(lease: Lease) {
    if (!this.active.has(lease.leaseId)) throw new Error('Unknown VM lease.');
    const result = LeaseSchema.parse(await this.transport.request({ version: 1, operation: 'destroy', leaseId: lease.leaseId, jobId: lease.jobId, baselineDigest: this.baselineDigest }));
    if (result.leaseId !== lease.leaseId || result.jobId !== lease.jobId || result.baselineDigest !== this.baselineDigest || result.status !== 'destroyed') throw new Error('VM disposal unverified.');
    this.active.delete(lease.leaseId);
  }
}
export class FakeDevelopmentProvider implements RunnerVmProvider {
  readonly mode = 'fake_development' as const;
  async createFromBaseline(_job: Job): Promise<never> { throw new Error('Fake runner cannot create a dedicated VM or produce authoritative evidence.'); }
  async execute(_job: Job, _lease: Lease, _bytes: Buffer): Promise<never> { throw new Error('Fake runner evidence is unverified.'); }
  async destroy(_lease: Lease): Promise<never> { throw new Error('Fake runner has no dedicated VM.'); }
  capability() { return { mode: this.mode, assurance: 'unverified', realValidation: 'unverified', satisfiesRequiredProfile: false, hostExecutionAllowed: false } as const; }
}
