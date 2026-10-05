import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIMITS, JobSchema, LeaseSchema, PROFILE, parseJob, signTrustedResult, trustedHarness, verifyTrustedResult } from '../../../packages/runner-protocol/index.js';
import type { Job, Lease, TrustedResult } from '../../../packages/runner-protocol/index.js';
import { RunnerConfigSchema, runnerCapability } from '../../../services/runner-controller/config.js';
import { RunnerController } from '../../../services/runner-controller/controller.js';
import { DedicatedKvmProvider, FakeDevelopmentProvider } from '../../../services/runner-controller/provider.js';
import { FileReplayStore } from '../../../services/runner-controller/replay.js';
import { SshBrokerTransport } from '../../../services/runner-controller/transport.js';
import type { ProcessSpec } from '../../../services/runner-controller/transport.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const bytes = Buffer.from('synthetic approved artifact');
const digest = createHash('sha256').update(bytes).digest('hex');
const config = { profile: PROFILE, host: 'runner.synthetic.invalid', user: 'runner', identityFile: '/operator/synthetic-key', knownHostsFile: '/operator/synthetic-known-hosts', resultPublicKey: pub, baselineDigest: 'c'.repeat(64), brokerVersion: 1, operatorDedicatedHostAttested: true };
function job(): Job { return { protocolVersion: 1, jobId: randomUUID(), attemptId: randomUUID(), jobKind: 'public', profile: PROFILE, packageHash: 'a'.repeat(64), submissionHash: 'b'.repeat(64), artifactHash: digest, imageDigest: 'sha256:' + 'd'.repeat(64), harnessId: 'pure-module/v1', harnessDigest: trustedHarness('pure-module/v1').digest, requiredCheckIds: ['published.check'], deadline: Date.now() + 120000, limits: DEFAULT_LIMITS }; }
function lease(j: Job): Lease { return { leaseId: randomUUID(), jobId: j.jobId, baselineDigest: config.baselineDigest, profile: PROFILE, status: 'fresh' }; }
function result(j: Job, l: Lease): TrustedResult { const { attemptId: _attempt, deadline, limits: _limits, requiredCheckIds: _checks, ...bindings } = j; return { ...bindings, leaseId: l.leaseId, outcome: 'passed', checks: [{ checkId: 'published.check', outcome: 'passed' }], expiresAt: deadline, logDigest: digest }; }

describe('closed approved protocol', () => {
  it.each(['command', 'url', 'shell', 'privateRepositoryRoot', 'signingKey'])('rejects extra privileged %s input', field => { expect(JobSchema.safeParse({ ...job(), [field]: 'synthetic-canary' }).success).toBe(false); });
  it('rejects unknown harness, forged mapping, profile/limits and repeated checks', () => {
    expect(() => trustedHarness('sh -c evil')).toThrow();
    expect(() => parseJob({ ...job(), harnessDigest: 'e'.repeat(64) })).toThrow();
    expect(JobSchema.safeParse({ ...job(), limits: { ...DEFAULT_LIMITS, seconds: 121 } }).success).toBe(false);
    expect(JobSchema.safeParse({ ...job(), profile: 'host-docker' }).success).toBe(false);
    expect(JobSchema.safeParse({ ...job(), requiredCheckIds: ['check', 'check'] }).success).toBe(false);
    expect(() => parseJob({ ...job(), deadline: Date.now() - 1 })).toThrow();
  });
  it('freezes fixed commands without asserting installed runtime capability', () => { const h = trustedHarness('pure-module/v1'); expect(h.args).toEqual(['supervise-pure-module']); expect(h.installed).toBe(false); expect(Object.isFrozen(h.args)).toBe(true); });
  it('accepts authenticated complete result bound to the exact active lease', () => { const j = job(), l = lease(j); expect(verifyTrustedResult(signTrustedResult(result(j,l),priv),j,l,pub).outcome).toBe('passed'); });
  it.each(['jobId','leaseId','jobKind','artifactHash','packageHash','submissionHash','imageDigest','harnessId','harnessDigest'])('rejects signed result with mismatched %s', field => { const j=job(), l=lease(j); const alternate = result(job(),lease(j)); const changed = { ...result(j,l), [field]: alternate[field as keyof TrustedResult] }; if (field==='jobKind') changed.jobKind='private'; if (['artifactHash','packageHash','submissionHash','harnessDigest'].includes(field)) Object.assign(changed,{[field]:'f'.repeat(64)}); if(field==='imageDigest')changed.imageDigest='sha256:'+'f'.repeat(64); if(field==='harnessId')changed.harnessId='frontend/v1'; expect(()=>verifyTrustedResult(signTrustedResult(changed,priv),j,l,pub)).toThrow(); });
  it('rejects unsigned/fake output, wrong key, missing checks, duplicates, failed check claimed passed, expired and disposed leases', () => {
    const j=job(), l=lease(j), good=signTrustedResult(result(j,l),priv);
    expect(()=>verifyTrustedResult({outcome:'passed'},j,l,pub)).toThrow();
    const other=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
    expect(()=>verifyTrustedResult(good,j,l,other)).toThrow();
    for(const checks of [[],[{checkId:'published.check',outcome:'failed' as const}],[{checkId:'published.check',outcome:'passed' as const},{checkId:'published.check',outcome:'passed' as const}]])expect(()=>verifyTrustedResult(signTrustedResult({...result(j,l),checks},priv),j,l,pub)).toThrow();
    expect(()=>verifyTrustedResult(good,j,{...l,status:'destroyed'},pub)).toThrow();
    expect(()=>verifyTrustedResult(good,j,l,pub,j.deadline+1)).toThrow();
  });
});
describe('authority and VM lifecycle (injected transport, no actual VM)', () => {
  it.each(['2130706433','127','0177.0.0.1','127.1','0x7f000001','0x7f.0.0.1','127.0.0x0.1','127.0.0.1','169.254.169.254','contributor.localhost'])('rejects local/numeric alias or metadata configuration %s', host => { expect(RunnerConfigSchema.safeParse({...config,host}).success).toBe(false); });
  it('rejects non-Ed25519 public keys and bounds all configuration fields', () => { expect(runnerCapability({...config,resultPublicKey:'synthetic-invalid-key'.repeat(3)}).status).toBe('needs_configuration');expect(RunnerConfigSchema.safeParse({...config,command:'evil'}).success).toBe(false); });
  it('claims replay durably once under concurrent controller restarts', async () => {
    const directory=await mkdtemp(join(tmpdir(),'runner-protocol-'));
    const id=randomUUID();
    try { const results=await Promise.allSettled([new FileReplayStore(directory).claim(id),new FileReplayStore(directory).claim(id)]); expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); await expect(new FileReplayStore(directory).claim(id)).rejects.toThrow(); await expect(new FileReplayStore(directory).claim('../unknown')).rejects.toThrow(); }
    finally { await rm(join(directory,id+'.claim'),{force:true}); await rmdir(directory); }
  });
  it('never creates VM or spends claim for mismatched artifact bytes', async () => { const provider={createFromBaseline:vi.fn(),execute:vi.fn(),destroy:vi.fn()}, replay={claim:vi.fn()}; await expect(new RunnerController(provider,replay,pub).run(job(),Buffer.from('wrong'))).rejects.toThrow(); expect(replay.claim).not.toHaveBeenCalled(); expect(provider.createFromBaseline).not.toHaveBeenCalled(); });
  it('freezes approved artifact bytes before asynchronous claims/lease creation', async () => {const j=job(),l=lease(j), artifact=Buffer.from(bytes), provider={createFromBaseline:vi.fn().mockResolvedValue(l),execute:vi.fn(async(_job:Job,_lease:Lease,snapshot:Buffer)=>{expect(snapshot).toEqual(bytes);return signTrustedResult(result(j,l),priv);}),destroy:vi.fn()}, replay={claim:vi.fn(async()=>{artifact.fill(0);})};await expect(new RunnerController(provider,replay,pub).run(j,artifact)).resolves.toMatchObject({outcome:'passed'});});
  it('disposes on forged results and prevents passed result when disposal fails', async () => {
    const j=job(), l=lease(j), destroy=vi.fn().mockResolvedValue(undefined), provider={createFromBaseline:vi.fn().mockResolvedValue(l),execute:vi.fn().mockResolvedValue({outcome:'passed'}),destroy};
    const controller=new RunnerController(provider,{claim:vi.fn()},pub);
    await expect(controller.run(j,bytes)).rejects.toThrow(); expect(destroy).toHaveBeenCalledWith(l);
    provider.execute.mockResolvedValue(signTrustedResult(result(j,l),priv)); destroy.mockRejectedValue(new Error('quarantined'));
    await expect(controller.run(j,bytes)).rejects.toThrow('quarantined');
  });
  it('validates fresh receipt and owns exact returned lease, uploads before fixed run and destroys it', async () => {
    const requests: Record<string,unknown>[]=[]; const transport={upload:vi.fn().mockResolvedValue(undefined),request:vi.fn(async(input:unknown)=>{const q=input as Record<string,unknown>;requests.push(q); if(q.operation==='create'||q.operation==='destroy')return {leaseId:q.leaseId,jobId:q.jobId,baselineDigest:q.baselineDigest,profile:PROFILE,status:q.operation==='create'?'fresh':'destroyed'};return {unavailable:true};})};
    const provider=new DedicatedKvmProvider(config,transport), j=job(), l=await provider.createFromBaseline(j);
    await expect(provider.execute(j,{...l,leaseId:randomUUID()},bytes)).rejects.toThrow();
    await provider.execute(j,l,bytes); expect(transport.upload).toHaveBeenCalledWith(j.jobId,bytes); await provider.destroy(l); await expect(provider.destroy(l)).rejects.toThrow(); expect(requests.map(q=>q.operation)).toEqual(['create','run','destroy']);
  });
  it('tries cleanup after create response loss and never reuses quarantined/mismatched lease', async () => {const transport={upload:vi.fn(),request:vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({status:'quarantined'})};await expect(new DedicatedKvmProvider(config,transport).createFromBaseline(job())).rejects.toThrow('Fresh VM unavailable');expect(transport.request.mock.calls.map(([input])=>(input as {operation:string}).operation)).toEqual(['create','destroy']);});
  it('fake runner and invalid/missing dedicated configuration stay unverified', async () => {expect(runnerCapability()).toMatchObject({status:'needs_configuration',realValidation:'unverified',hostExecutionAllowed:false});expect(runnerCapability(config)).toMatchObject({status:'configured_not_validated',realValidation:'unverified'});expect(RunnerConfigSchema.safeParse({...config,host:'http://evil'}).success).toBe(false);expect(RunnerConfigSchema.safeParse({...config,host:'localhost'}).success).toBe(false);expect(RunnerConfigSchema.safeParse({...config,operatorDedicatedHostAttested:false}).success).toBe(false);const fake=new FakeDevelopmentProvider();expect(fake.capability().satisfiesRequiredProfile).toBe(false);await expect(fake.createFromBaseline(job())).rejects.toThrow();});
  it('SSH command is fixed, pins host keys, disables forwarding and bounds requests', async () => {
    const execute=vi.fn(async(spec:ProcessSpec)=>{expect(spec.executable).toBe('ssh');expect(spec.args.at(-1)).toBe('/opt/private-task/broker/broker.py');expect(spec.args).toContain('StrictHostKeyChecking=yes');expect(spec.args).toContain('ClearAllForwardings=yes');expect(spec.timeoutMs).toBeLessThanOrEqual(135000);return '{"error":"synthetic_unavailable"}';});const transport=new SshBrokerTransport(config,execute);await transport.request({version:1,operation:'probe'});await expect(transport.request('x'.repeat(300000))).rejects.toThrow();expect(execute).toHaveBeenCalledOnce();expect(()=>new SshBrokerTransport({...config,identityFile:'bad\npath'},execute)).toThrow();
  });
  it('SFTP only writes a bounded UUID file under fixed broker staging and exact bytes', async () => {
    const id=randomUUID();const execute=vi.fn(async(spec:ProcessSpec)=>{expect(spec.executable).toBe('sftp');expect(spec.input).toContain(`/var/lib/private-task/staging/${id}.bin`);const local=spec.input.match(/^put "([^"]+)" /)![1]!;expect(await readFile(local)).toEqual(bytes);return '';});const transport=new SshBrokerTransport(config,execute);await transport.upload(id,bytes);await expect(transport.upload('../evil',bytes)).rejects.toThrow();expect(execute).toHaveBeenCalledOnce();
  });
  it('executable Python broker tests challenge mocked commands, baseline bytes, lease ownership and quarantine/disposal', () => { const output=execFileSync(process.execPath,['tests/runner/protocol/broker-check.mjs'],{encoding:'utf8',timeout:20000,stdio:'pipe'});expect(output).toBe('');expect(LeaseSchema.safeParse({status:'fresh',command:'evil'}).success).toBe(false); });
});
