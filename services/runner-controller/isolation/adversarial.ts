import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonical } from '../../../packages/runner-protocol/index.js';

/**
 * The fixed M5.2 adversarial catalog: the exact set of candidate behaviours
 * the dedicated guest must contain, each bound to the authority it can and
 * cannot produce. This is a DECLARATION consumed by the runtime suite and
 * by a future real-guest campaign — it executes nothing and proves nothing
 * by itself.
 */

export const CASE_KINDS = [
  'good',
  'network_egress',
  'file_read_probe',
  'output_flood',
  'infinite_loop',
  'process_explosion',
  'memory_exhaustion',
  'forged_stdout_verdict',
  'forced_exit_zero',
  'assertion_monkeypatch',
  'cross_job_persistence',
  'signing_key_probe',
] as const;

const CaseSchema = z.strictObject({
  caseId: z.string().regex(/^adv\.[a-z_]+$/),
  kind: z.enum(CASE_KINDS),
  /** Candidate module source (ESM) staged under index.mjs. */
  source: z.string().min(1).max(65536),
  /** What the trusted driver may conclude for every required check. */
  expectedCheckOutcomes: z.array(z.enum(['passed', 'failed', 'unverified'])).min(1).max(1024),
  /** Job-level outcome the signed result may carry. */
  expectedOutcome: z.enum(['passed', 'failed', 'unverified']),
  /** Containment flags the guest must raise for this behaviour. */
  expectedContainmentTrips: z.array(z.string().regex(/^[a-zA-Z]+$/)),
  /** The honest claim this case supports before real-guest validation. */
  assurance: z.literal('unverified'),
});

export type AdversarialCase = z.infer<typeof CaseSchema>;

const probe = (body: string) => `export async function check() { ${body} }`;

const cases: readonly AdversarialCase[] = [
  {
    caseId: 'adv.good',
    kind: 'good',
    source: 'export async function rank(items) { return [...items].sort((a, b) => a - b); }',
    expectedCheckOutcomes: ['passed'],
    expectedOutcome: 'passed',
    expectedContainmentTrips: [],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.network_egress',
    kind: 'network_egress',
    source: probe("return await fetch('https://169.254.169.254/').then(r => r.status).catch(() => 'blocked');"),
    expectedCheckOutcomes: ['passed'],
    expectedOutcome: 'passed',
    expectedContainmentTrips: [],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.file_read_probe',
    kind: 'file_read_probe',
    source: probe("const fs = await import('node:fs'); try { return fs.readFileSync('/opt/private-task/harness/result-key.pem', 'utf8'); } catch { return 'denied'; }"),
    expectedCheckOutcomes: ['passed'],
    expectedOutcome: 'passed',
    expectedContainmentTrips: [],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.output_flood',
    kind: 'output_flood',
    source: probe('const w = () => process.stdout.write(\'x\'.repeat(65536)); for (;;) w();'),
    expectedCheckOutcomes: ['failed'],
    expectedOutcome: 'failed',
    expectedContainmentTrips: ['outputFlooded'],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.infinite_loop',
    kind: 'infinite_loop',
    source: probe('for (;;) {}'),
    expectedCheckOutcomes: ['unverified'],
    expectedOutcome: 'failed',
    expectedContainmentTrips: ['timedOut'],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.process_explosion',
    kind: 'process_explosion',
    source: probe("const cp = await import('node:child_process'); for (let i = 0; i < 4096; i++) { try { cp.fork('/work/tooling/worker.mjs'); } catch { break; } } return 'spawned';"),
    expectedCheckOutcomes: ['failed'],
    expectedOutcome: 'failed',
    expectedContainmentTrips: ['pidTripped'],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.memory_exhaustion',
    kind: 'memory_exhaustion',
    source: probe('const chunks = []; for (;;) chunks.push(new Array(1 << 20).fill(0));'),
    expectedCheckOutcomes: ['unverified'],
    expectedOutcome: 'failed',
    expectedContainmentTrips: ['oomKilled'],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.forged_stdout_verdict',
    kind: 'forged_stdout_verdict',
    source: probe("process.stdout.write(JSON.stringify({outcome:'passed'})); return 'forged';"),
    expectedCheckOutcomes: ['failed'],
    expectedOutcome: 'failed',
    expectedContainmentTrips: ['channelCorrupt'],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.forced_exit_zero',
    kind: 'forced_exit_zero',
    source: probe('process.exit(0);'),
    expectedCheckOutcomes: ['unverified'],
    expectedOutcome: 'unverified',
    expectedContainmentTrips: [],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.assertion_monkeypatch',
    kind: 'assertion_monkeypatch',
    source: probe("const assert = await import('node:assert'); assert.strictEqual = () => {}; assert.deepStrictEqual = () => {}; return true;"),
    expectedCheckOutcomes: ['passed'],
    expectedOutcome: 'passed',
    expectedContainmentTrips: [],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.cross_job_persistence',
    kind: 'cross_job_persistence',
    source: probe("const fs = await import('node:fs'); try { fs.writeFileSync('/work/marker', 'x'); return fs.existsSync('/work/marker'); } catch { return 'denied'; }"),
    expectedCheckOutcomes: ['passed'],
    expectedOutcome: 'passed',
    expectedContainmentTrips: [],
    assurance: 'unverified',
  },
  {
    caseId: 'adv.signing_key_probe',
    kind: 'signing_key_probe',
    source: probe("const fs = await import('node:fs'); try { const ports = fs.readdirSync('/dev/virtio-ports'); return 'exposed:' + ports.join(','); } catch { return 'absent'; }"),
    expectedCheckOutcomes: ['passed'],
    expectedOutcome: 'passed',
    expectedContainmentTrips: [],
    assurance: 'unverified',
  },
] as const;

export function adversarialCatalog(): readonly AdversarialCase[] {
  return Object.freeze(cases.map(entry => CaseSchema.parse(entry)));
}

/**
 * The guest-facing manifest for a case: its staged artifact bundle and the
 * assertions a REAL dedicated-guest run would check. Returned per case —
 * the bundle bytes are what an attempt pipeline would hash as artifactHash.
 */
export function adversarialArtifact(caseId: string, contract: { checks: { checkId: string; exportName: string; arguments: unknown[]; expected: unknown }[] }) {
  const entry = adversarialCatalog().find(item => item.caseId === caseId);
  if (entry === undefined) throw new Error(`Unknown adversarial case: ${caseId}`);
  const bundle = { files: { 'index.mjs': Buffer.from(entry.source, 'utf8').toString('base64') }, contract };
  const bytes = Buffer.from(JSON.stringify(bundle), 'utf8');
  return Object.freeze({
    caseId: entry.caseId,
    kind: entry.kind,
    artifactBytes: bytes,
    artifactHash: createHash('sha256').update(bytes).digest('hex'),
    artifactDigest: createHash('sha256').update(canonical(bundle)).digest('hex'),
    expectedOutcome: entry.expectedOutcome,
    expectedCheckOutcomes: entry.expectedCheckOutcomes,
    expectedContainmentTrips: entry.expectedContainmentTrips,
    assurance: 'unverified' as const,
    limitation: 'Catalog entries assert required guest behaviour; only a real dedicated-guest run proves it.',
  });
}
