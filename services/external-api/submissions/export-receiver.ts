import type { KeyObject } from 'node:crypto';
import { ExportAckSchema, ExportPullSchema, SubmissionProtocolRejected, verifyExportRequest, type ExportAck, type ExportPull } from './protocol.js';
import { SubmissionRejected, SqlSubmissionStore } from './store.js';

export interface ExportResult {
  readonly status: 'export' | 'empty' | 'delivered' | 'already_delivered';
  readonly eventId: string;
  readonly export?: { permitId: string; payload: unknown };
}

export class SubmissionExportReceiver {
  constructor(
    private readonly store: SqlSubmissionStore,
    private readonly importPublicKey: KeyObject | string | Buffer,
  ) {}

  /** Verify a signed pull/ack request from the private importer and apply it. */
  async receive(input: unknown, nowMs = Date.now()): Promise<ExportResult> {
    const request = verifyExportRequest(input, this.importPublicKey, nowMs);
    const pull = ExportPullSchema.safeParse(request);
    if (pull.success) return this.pull(pull.data);
    const ack = ExportAckSchema.safeParse(request);
    if (ack.success) return this.ack(ack.data);
    throw new SubmissionProtocolRejected('invalid_request');
  }

  private async pull(request: ExportPull): Promise<ExportResult> {
    const next = await this.store.pullNext();
    if (!next) return { status: 'empty', eventId: request.eventId };
    return { status: 'export', eventId: request.eventId, export: next };
  }

  private async ack(request: ExportAck): Promise<ExportResult> {
    const status = await this.store.acknowledge(request.permitId, request.payloadHash);
    return { status, eventId: request.eventId };
  }
}
