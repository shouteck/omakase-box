import { request } from 'node:http';
import { performance } from 'node:perf_hooks';
import { canonicalize } from '../../contracts/hash.js';
import { OllamaConfigSchema, OllamaEnvelopeSchema, planningOutputFormat } from '../../contracts/private/planning.js';
import type { IntentProposal, PartitionProposal } from '../../contracts/private/planning.js';
import { proposalContext, proposalResult, validateIntentProposal, validatePartitionInput, validatePartitionProposal, validatePlanningInput } from './contracts.js';
import type { PlannerProvider, PrivatePlanningInput, PrivatePartitionInput, ProviderMode, ProviderResult } from './contracts.js';
import { PLANNING_SYSTEM_PROMPT } from '../prompts/system.js';

export interface ModelRequest { endpoint: string; body: string; signal: AbortSignal; maxResponseBytes: number }
export interface ModelResponse { status: number; body: Uint8Array }
export type ModelTransport = (input: ModelRequest) => Promise<ModelResponse>;
type FailureReason = Extract<ProviderResult<never>, { status: 'failed' }>['reason'];
class ProviderFailure extends Error { constructor(readonly reason: FailureReason) { super(reason); } }
function endpoint(value: string): boolean {
  const match = value.match(/^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/api\/chat$/);
  return Boolean(match && Number(match[1]) <= 65535);
}
export const loopbackTransport: ModelTransport = input => new Promise((resolve, reject) => {
  if (!endpoint(input.endpoint) || Buffer.byteLength(input.body) > 524288 || input.maxResponseBytes !== 524288 || input.signal.aborted) { reject(new ProviderFailure('invalid_input')); return; }
  const url = new URL(input.endpoint);
  const call = request({ hostname: url.hostname === '[::1]' ? '::1' : '127.0.0.1', port: url.port, path: '/api/chat', method: 'POST', signal: input.signal, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(input.body) } }, response => {
    if (response.statusCode !== 200) { reject(new ProviderFailure(response.statusCode && response.statusCode >= 300 && response.statusCode < 400 ? 'invalid_response' : 'provider_unavailable')); response.destroy(); call.destroy(); return; }
    if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { reject(new ProviderFailure('invalid_response')); response.destroy(); return; }
    const chunks: Buffer[] = []; let size = 0;
    response.on('data', (bytes: Buffer) => {
      size += bytes.length;
      if (size > input.maxResponseBytes) { reject(new ProviderFailure('invalid_response')); response.destroy(); call.destroy(); return; }
      chunks.push(bytes);
    });
    response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) }));
    response.on('error', () => reject(new ProviderFailure('provider_unavailable')));
    response.on('aborted', () => reject(new ProviderFailure('provider_unavailable')));
  });
  call.on('error', () => reject(new ProviderFailure('provider_unavailable')));
  call.end(input.body);
});
export class OllamaPlannerProvider implements PlannerProvider {
  readonly mode: ProviderMode;
  private readonly config: { endpoint: string; model: string; timeoutMs: number } | null;
  private readonly transport: ModelTransport;
  constructor(input?: unknown, transport?: ModelTransport) {
    this.mode = transport ? 'ollama_protocol_mock' : 'ollama_live';
    this.transport = transport ?? loopbackTransport;
    try { const parsed = OllamaConfigSchema.parse(JSON.parse(canonicalize(input))); this.config = endpoint(parsed.endpoint) ? parsed : null; }
    catch { this.config = null; }
  }
  proposeIntent(input: PrivatePlanningInput, signal?: AbortSignal): Promise<ProviderResult<IntentProposal>> { return this.perform('intent', input, signal); }
  proposePartition(input: PrivatePartitionInput, signal?: AbortSignal): Promise<ProviderResult<PartitionProposal>> { return this.perform('partition', input, signal); }
  private async perform<T extends IntentProposal | PartitionProposal>(kind: 'intent' | 'partition', value: unknown, signal?: AbortSignal): Promise<ProviderResult<T>> {
    const failed = (reason: FailureReason): ProviderResult<T> => ({ status: 'failed', mode: this.mode, assurance: 'unverified', reason });
    if (!this.config) return failed('needs_configuration');
    if (signal?.aborted) return failed('cancelled');
    let input: PrivatePlanningInput | PrivatePartitionInput;
    try { input = kind === 'intent' ? validatePlanningInput(value) : validatePartitionInput(value); }
    catch { return failed('invalid_input'); }
    const config = this.config, controller = new AbortController(), deadline = performance.now() + config.timeoutMs;
    const ensureActive = () => {
      if (signal?.aborted) throw new ProviderFailure('cancelled');
      if (controller.signal.aborted || performance.now() >= deadline) throw new ProviderFailure('timeout');
    };
    let rejectAbort: (error: ProviderFailure) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const cancel = () => { controller.abort(); rejectAbort(new ProviderFailure('cancelled')); };
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { controller.abort(); rejectAbort(new ProviderFailure('timeout')); }, config.timeoutMs);
    const work = async (): Promise<ProviderResult<T>> => {
      const messages = [{ role: 'system', content: PLANNING_SYSTEM_PROMPT }, { role: 'user', content: canonicalize(input) }];
      const format = planningOutputFormat(kind);
      for (const repairAttempts of [0,1] as const) {
        ensureActive();
        const body = canonicalize({ model: config.model, stream: false, format, messages, options: { temperature: 0, num_predict: 4096 } });
        if (Buffer.byteLength(body) > 524288) throw new ProviderFailure('invalid_input');
        const response = await this.transport({ endpoint: config.endpoint, body, signal: controller.signal, maxResponseBytes: 524288 });
        ensureActive();
        if (response.status !== 200) throw new ProviderFailure(response.status >= 300 && response.status < 400 ? 'invalid_response' : 'provider_unavailable');
        if (!(response.body instanceof Uint8Array) || response.body.byteLength > 524288) throw new ProviderFailure('invalid_response');
        let envelope;
        try { envelope = OllamaEnvelopeSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body))); }
        catch { throw new ProviderFailure('invalid_response'); }
        if (envelope.model !== config.model || (envelope.message.tool_calls?.length ?? 0) > 0) throw new ProviderFailure('invalid_response');
        try {
          const raw = JSON.parse(envelope.message.content);
          const proposal = (kind === 'intent' ? validateIntentProposal(raw, proposalContext(input as PrivatePlanningInput)) : validatePartitionProposal(raw)) as T;
          ensureActive();
          return proposalResult(this.mode, input, proposal, repairAttempts);
        } catch (error) {
          if (error instanceof ProviderFailure) throw error;
          if (repairAttempts === 1) throw new ProviderFailure('invalid_response');
          messages.push({ role: 'system', content: 'The previous response failed JSON/application schema validation. Return exactly one corrected schema proposal for the original input. Do not add authority or tools.' });
        }
      }
      throw new ProviderFailure('invalid_response');
    };
    try { return await Promise.race([work(), aborted]); }
    catch (error) { return failed(signal?.aborted ? 'cancelled' : controller.signal.aborted || performance.now() >= deadline ? 'timeout' : error instanceof ProviderFailure ? error.reason : 'provider_unavailable'); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.abort(); }
  }
}
