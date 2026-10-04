import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import { HashSchema, VersionSchema } from '../../../packages/contracts/common.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { ProviderUnavailable } from '../intents/types.js';
import type { ProviderMode } from '../../../packages/planner/providers/contracts.js';
import type { ComposedPartition } from '../../../packages/planner/partition/compose.js';

export type PreparationPlanningMode = 'demo' | 'ollama';

export const PartitionRequestSchema = z.strictObject({ expectedVersion: VersionSchema, expectedHash: HashSchema, mode: z.enum(['demo', 'ollama']) });

export class PreparationInvalid extends Error { constructor() { super('invalid_input'); } }

export interface ProviderProvenanceView { mode: ProviderMode; inputHash: string; proposalHash: string; repairAttempts: 0 | 1; modelVerification: string }

export interface PreparationProjection {
  readonly intentId: string;
  readonly intentVersion: number;
  readonly intentContentHash: string;
  readonly goal: string;
  readonly provider: ProviderProvenanceView;
  readonly partition: ComposedPartition;
  readonly assurance: 'bounded';
}

export function safePreparationError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError || error instanceof PreparationInvalid) return reply.code(400).send({ error: 'invalid_input' });
  if (error instanceof AuthDenied) return reply.code(404).send({ error: 'not_found' });
  if (error instanceof WorkflowError) {
    if (error.code === 'forbidden_role') return reply.code(403).send({ error: 'forbidden_role' });
    if (error.code === 'missing_evidence') return reply.code(422).send({ error: 'missing_evidence' });
    return reply.code(409).send({ error: error.code });
  }
  if (error instanceof ProviderUnavailable) return reply.code(503).send({ error: 'provider_unavailable', reason: error.reason, mode: error.mode });
  return reply.code(503).send({ error: 'resource_unavailable' });
}
