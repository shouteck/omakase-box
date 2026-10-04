import { expect, it, vi } from 'vitest';
import { OllamaPlannerProvider } from '../../../packages/planner/providers/ollama.js';
import type { ModelRequest } from '../../../packages/planner/providers/ollama.js';
import { intentProposal, planningInput, partitionInput, wire } from './fixtures.js';
import { fullStackContract } from '../../contracts/fixtures.js';
import { planningOutputFormat } from '../../../packages/contracts/private/planning.js';
import { canonicalize, contentHash } from '../../../packages/contracts/hash.js';

const config = { endpoint: 'http://127.0.0.1:11434/api/chat', model: 'synthetic-model', timeoutMs: 1000 };
it('exports actual application-owned JSON response schemas for both proposal operations', () => {
  expect(() => planningOutputFormat('intent')).not.toThrow();
  expect(() => planningOutputFormat('partition')).not.toThrow();
  expect(() => canonicalize(planningOutputFormat('intent'))).not.toThrow();
  expect(() => canonicalize(planningOutputFormat('partition'))).not.toThrow();
});
it('sends fixed application schema, bounded evidence and no tools; injected transport stays explicitly mock', async () => {
  const input = planningInput(), transport = vi.fn(async (request: ModelRequest) => {
    expect(request.endpoint).toBe(config.endpoint);
    const body = JSON.parse(request.body);
    expect(body.model).toBe(config.model); expect(body.stream).toBe(false); expect(body.format.type).toBe('object'); expect(body.tools).toBeUndefined();
    expect(body.messages[0].role).toBe('system'); expect(body.messages[1].role).toBe('user');
    expect(JSON.parse(body.messages[1].content).request.goal).toBe(input.request.goal);
    return wire(intentProposal(input));
  });
  const result = await new OllamaPlannerProvider(config, transport).proposeIntent(input);
  expect(result).toMatchObject({ status: 'proposal', mode: 'ollama_protocol_mock', assurance: 'unverified', provenance: { repairAttempts: 0, modelVerification: 'protocol_mock' } });
  expect(transport).toHaveBeenCalledOnce();
});
it('repairs malformed content once without echoing the bad response or adopting injected instructions', async () => {
  const input = planningInput();
  const transport = vi.fn().mockResolvedValueOnce(wire('synthetic-private-malformed-canary')).mockResolvedValueOnce(wire(intentProposal(input)));
  expect(await new OllamaPlannerProvider(config, transport).proposeIntent(input)).toMatchObject({ status: 'proposal', provenance: { repairAttempts: 1 } });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1]![0].body).not.toContain('synthetic-private-malformed-canary');
});
it('never invents success after two invalid responses', async () => {
  const input = planningInput(), transport = vi.fn().mockResolvedValue(wire({ ...intentProposal(input), state: 'approved' }));
  expect(await new OllamaPlannerProvider(config, transport).proposeIntent(input)).toMatchObject({ status: 'failed', reason: 'invalid_response', mode: 'ollama_protocol_mock' });
  expect(transport).toHaveBeenCalledTimes(2);
});
it('rejects tool calls, incomplete envelopes, redirects and oversized wire data without repair', async () => {
  const input = planningInput();
  const envelope = JSON.parse(wire(intentProposal(input)).body.toString());
  for (const response of [
    { status: 200, body: Buffer.from(JSON.stringify({ ...envelope, message: { ...envelope.message, tool_calls: [{ function: { name: 'synthetic-host-read' } }] } })) },
    { status: 200, body: Buffer.from(JSON.stringify({ ...envelope, done: false })) },
    { status: 302, body: Buffer.from('synthetic redirect') },
    { status: 200, body: Buffer.alloc(524289, 65) }
  ]) {
    const transport = vi.fn().mockResolvedValue(response);
    expect(await new OllamaPlannerProvider(config, transport).proposeIntent(input)).toMatchObject({ status: 'failed' });
    expect(transport).toHaveBeenCalledOnce();
  }
});
it('invalid input cannot control egress or carry credentials to a model', async () => {
  const transport = vi.fn();
  const input = planningInput();
  for (const unsafe of [{ ...input, endpoint: 'http://synthetic-unapproved.invalid/api/chat' }, { ...input, apiKey: 'synthetic-secret-canary' }, { ...input, imageUnderstanding: true }]) {
    expect(await new OllamaPlannerProvider(config, transport).proposeIntent(unsafe as typeof input)).toMatchObject({ status: 'failed', reason: 'invalid_input' });
  }
  expect(transport).not.toHaveBeenCalled();
});
it('missing or remote/credential/path configuration fails closed without transport', async () => {
  const transport = vi.fn();
  for (const invalid of [undefined, { ...config, endpoint: 'https://synthetic-unapproved.invalid/api/chat' }, { ...config, endpoint: 'http://user:password@127.0.0.1:11434/api/chat' }, { ...config, endpoint: 'http://127.0.0.1:11434/api/chat?redirect=1' }, { ...config, endpoint: 'http://127.1:11434/api/chat' }, { ...config, endpoint: 'http://127.0.0.1:11434/api/chat', tools: ['shell'] }]) {
    expect(await new OllamaPlannerProvider(invalid, transport).proposeIntent(planningInput())).toMatchObject({ status: 'failed', reason: 'needs_configuration' });
  }
  expect(transport).not.toHaveBeenCalled();
});
it('timeout and cancellation terminate even an injected transport that ignores its signal', async () => {
  const never = vi.fn(() => new Promise<never>(() => {}));
  const provider = new OllamaPlannerProvider({ ...config, timeoutMs: 25 }, never);
  expect(await provider.proposeIntent(planningInput())).toMatchObject({ status: 'failed', reason: 'timeout' });
  const controller = new AbortController();
  const call = provider.proposeIntent(planningInput(), controller.signal); controller.abort();
  expect(await call).toMatchObject({ status: 'failed', reason: 'cancelled' });
  const before = never.mock.calls.length;
  expect(await provider.proposeIntent(planningInput(), controller.signal)).toMatchObject({ status: 'failed', reason: 'cancelled' });
  expect(never.mock.calls.length).toBe(before);
});
it('binds stored immutable ready-body approvals without rehashing or fabricating a changed approved payload', async () => {
  const input = partitionInput();
  input.approvedIntent.state = 'ready_for_approval'; input.approvedIntentHash = contentHash(input.approvedIntent);
  input.approval = { intentId: input.approvedIntent.intentId, version: input.approvedIntent.version, contentHash: input.approvedIntentHash, state: 'approved' };
  const transport = vi.fn().mockResolvedValue(wire({ status: 'not_supported', reason: 'Synthetic unsupported fixture.', missingCapabilities: ['A new reviewed adapter.'], retainedPrivateWork: [] }));
  expect(await new OllamaPlannerProvider(config, transport).proposePartition(input)).toMatchObject({ status: 'proposal' });
  transport.mockClear();
  expect(await new OllamaPlannerProvider(config, transport).proposePartition({ ...input, approval: { ...input.approval, version: 2 } })).toMatchObject({ status: 'failed', reason: 'invalid_input' });
  expect(transport).not.toHaveBeenCalled();
});
it('validates partition input approval binding and a connected combined proposal', async () => {
  const input = partitionInput(), task = fullStackContract(true);
  const { disciplines, workUnits, interfaces, requirements, endToEndRequirements, publicChecks, editablePaths } = task;
  const proposal = { status: 'proposed', composition: { disciplines, workUnits, interfaces, requirements, endToEndRequirements, publicChecks, editablePaths }, retainedPrivateWork: ['Protected computation remains private.'] };
  const transport = vi.fn().mockResolvedValue(wire(proposal));
  expect(await new OllamaPlannerProvider(config, transport).proposePartition(input)).toMatchObject({ status: 'proposal', proposal: { composition: { disciplines: ['frontend','backend','security'] } } });
  transport.mockClear();
  expect(await new OllamaPlannerProvider(config, transport).proposePartition({ ...input, approvedIntentHash: 'f'.repeat(64) })).toMatchObject({ status: 'failed', reason: 'invalid_input' });
  expect(transport).not.toHaveBeenCalled();
});
