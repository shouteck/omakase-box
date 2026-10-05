import { randomUUID, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { byteHash, contentHash } from '../../../packages/contracts/hash.js';
import { HashSchema, OpaqueIdSchema } from '../../../packages/contracts/common.js';
import { SignedPermitSchema, signPayload, SubmissionProtocolRejected, verifyAttemptPermit } from '../../external-api/submissions/protocol.js';
import { ImportRejected, SqlSubmissionImportStore, type ExportRecord } from './store.js';

const ExportSubmissionSchema = z.strictObject({
  id: OpaqueIdSchema,
  reservationId: OpaqueIdSchema,
  contributorId: OpaqueIdSchema,
  taskId: OpaqueIdSchema,
  taskVersion: z.number().int().positive(),
  packageHash: HashSchema,
  submissionHash: HashSchema,
  patchBase64: z.string().min(4),
});

const ExportResponseSchema = z.strictObject({
  status: z.enum(['export', 'empty', 'delivered', 'already_delivered']),
  eventId: OpaqueIdSchema,
  export: z.strictObject({ permitId: OpaqueIdSchema, payload: z.looseObject({ permit: SignedPermitSchema, submission: ExportSubmissionSchema }) }).optional(),
});

export class ImportDeliveryFailed extends Error {
  constructor(readonly code: 'transport_unavailable' | 'invalid_response') {
    super(code);
    this.name = 'ImportDeliveryFailed';
  }
}

export interface ImportTransport {
  send(packet: unknown): Promise<unknown>;
}

export interface PollResult {
  readonly status: 'empty' | 'imported' | 'duplicate' | 'deferred';
  readonly permitId?: string;
}

/**
 * Bounded pull importer (M6.3). The private service requests the oldest
 * undelivered attempt export, verifies the external Ed25519 permit and the
 * exact submission binding, commits private_evaluations + import rows, then
 * acknowledges. Crash between import and ack replays the same export and
 * resolves idempotently to the already-imported permit — never a second
 * authoritative attempt and never a job without a committed permit.
 */
export class SubmissionImporter {
  constructor(
    private readonly store: SqlSubmissionImportStore,
    private readonly importKey: KeyObject | string | Buffer,
    private readonly permitPublicKey: KeyObject | string | Buffer,
    private readonly transport: ImportTransport,
  ) {}

  async pollOnce(now = new Date()): Promise<PollResult> {
    const pull = signPayload(
      {
        schemaVersion: 1,
        audience: 'external-submission-export/v1',
        eventId: randomUUID(),
        nonce: randomUUID(),
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      },
      this.importKey,
    );
    let response: unknown;
    try {
      response = await this.transport.send(pull);
    } catch {
      throw new ImportDeliveryFailed('transport_unavailable');
    }
    const parsed = ExportResponseSchema.safeParse(response);
    if (!parsed.success) throw new ImportDeliveryFailed('invalid_response');
    if (parsed.data.status === 'empty') return { status: 'empty' };
    if (parsed.data.status !== 'export' || !parsed.data.export) throw new ImportDeliveryFailed('invalid_response');
    const record = parsed.data.export.payload as unknown as ExportRecord;
    // The ack binds the outbox payload itself (the signed permit packet); the
    // patch hash is bound transitively through `submissionHash`.
    const payloadHash = contentHash(record.permit);

    // Verify the external permit and the exact export binding before any write.
    const permit = verifyAttemptPermit(record.permit, this.permitPublicKey, now.getTime());
    if (permit.permitId !== parsed.data.export.permitId) throw new SubmissionProtocolRejected('invalid_permit');
    const patchBytes = Buffer.from(record.submission.patchBase64, 'base64');
    if (patchBytes.length === 0 || patchBytes.length > 1_048_576 || byteHash(patchBytes) !== record.submission.submissionHash) {
      throw new ImportRejected('invalid_export');
    }

    const imported = await this.store.importPermit(record, patchBytes);

    const ack = signPayload(
      {
        schemaVersion: 1,
        audience: 'external-submission-export-ack/v1',
        eventId: randomUUID(),
        nonce: randomUUID(),
        permitId: permit.permitId,
        payloadHash,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      },
      this.importKey,
    );
    try {
      const ackResponse = ExportResponseSchema.safeParse(await this.transport.send(ack));
      if (!ackResponse.success || (ackResponse.data.status !== 'delivered' && ackResponse.data.status !== 'already_delivered')) {
        return { status: 'deferred', permitId: permit.permitId };
      }
    } catch {
      return { status: 'deferred', permitId: permit.permitId };
    }
    return { status: imported.status === 'imported' ? 'imported' : 'duplicate', permitId: permit.permitId };
  }
}
