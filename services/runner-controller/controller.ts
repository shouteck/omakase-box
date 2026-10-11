import { createHash } from 'node:crypto';
import { parseJob, verifyTrustedResult } from '../../packages/runner-protocol/index.js';
import type { RunnerVmProvider } from './provider.js';
import type { ReplayStore } from './replay.js';

export class RunnerController {
  constructor(private readonly provider: RunnerVmProvider, private readonly replay: ReplayStore, private readonly resultPublicKey: string) {}
  async run(input: unknown, approvedArtifact: Buffer) {
    const job = parseJob(input);
    const artifact = Buffer.from(approvedArtifact);
    if (artifact.length > 16777216 || createHash('sha256').update(artifact).digest('hex') !== job.artifactHash) throw new Error('Approved artifact binding mismatch.');
    await this.replay.claim(job.jobId);
    const lease = await this.provider.createFromBaseline(job);
    try { return verifyTrustedResult(await this.provider.execute(job, lease, artifact), job, lease, this.resultPublicKey); }
    finally { await this.provider.destroy(lease); }
  }
}
