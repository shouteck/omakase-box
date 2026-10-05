import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { AuthClient, AuthDatabase, SessionActor } from '../../../packages/contracts/auth/store.js';
import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { importPinnedSnapshot } from '../snapshots/importer.js';
import type { PinnedSnapshot } from '../snapshots/importer.js';
import { collectPlanningEvidence } from '../../../packages/planner/retrieval/index.js';
import { EvidenceLimit, EvidenceUploadSchema, IntakeInvalid, MAX_REQUEST_EVIDENCE, MAX_REQUEST_EVIDENCE_BYTES, RequestInputSchema, SnapshotManifestSchema, SnapshotSourceSchema } from './types.js';
import type { SnapshotSource } from './types.js';
import { validateEvidence } from './media.js';

const Id = z.uuid();
const Digest = /^[a-f0-9]{64}$/;
function id(value: unknown) { const parsed = Id.safeParse(value); if (!parsed.success) throw new AuthDenied(); return parsed.data; }
function objectBytes(row: Record<string, unknown> | undefined, sha256: string, length: number): Buffer {
  if (!row || !Buffer.isBuffer(row.payload) || row.payload.length !== length || length > 1048576 || byteHash(row.payload) !== sha256) throw new Error('intake_object_unavailable');
  return Buffer.from(row.payload);
}
export class PrivateIntakeStore {
  private readonly sources: readonly SnapshotSource[];
  constructor(private readonly database: AuthDatabase, sources: unknown = []) {
    this.sources = z.array(SnapshotSourceSchema).max(32).parse(sources);
    if (new Set(this.sources.map(source => source.id)).size !== this.sources.length) throw new IntakeInvalid();
  }
  private async transaction<T>(actor: SessionActor, roles: readonly string[], operation: (client: AuthClient) => Promise<T>): Promise<T> {
    if (!Id.safeParse(actor.id).success || !roles.includes(actor.role) || !Digest.test(actor.sessionHash) || !Digest.test(actor.csrfHash)) throw new AuthDenied();
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query(`SELECT account.id FROM private_accounts AS account
        JOIN private_sessions AS session ON session.account_id=account.id
        WHERE account.id=$1 AND account.role=$2 AND NOT account.disabled
        AND session.token_hash=$3 AND session.csrf_hash=$4 AND session.expires_at>now()
        FOR SHARE OF account, session`, [actor.id, actor.role, actor.sessionHash, actor.csrfHash])).rows[0];
      if (!current) throw new AuthDenied();
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async putObject(client: AuthClient, bytes: Buffer): Promise<string> {
    const sha256 = byteHash(bytes);
    await client.query('INSERT INTO private_intake_objects (sha256,byte_count,payload) VALUES ($1,$2,$3) ON CONFLICT (sha256) DO NOTHING', [sha256, bytes.length, bytes]);
    objectBytes((await client.query('SELECT payload FROM private_intake_objects WHERE sha256=$1', [sha256])).rows[0], sha256, bytes.length);
    return sha256;
  }
  async listSnapshots(actor: SessionActor) {
    return this.transaction(actor, ['owner','requester','operator'], async client => {
      const rows = (await client.query('SELECT id,snapshot_hash,file_count FROM private_snapshots ORDER BY created_at DESC,id LIMIT 101')).rows;
      return { snapshots: rows.slice(0,100).map(row => ({ id: id(row.id), snapshotHash: String(row.snapshot_hash), fileCount: Number(row.file_count) })), hasMore: rows.length > 100 };
    });
  }
  async registerSnapshot(actor: SessionActor, sourceId: string) {
    return this.transaction(actor, ['owner','operator'], async client => {
      const source = this.sources.find(item => item.id === sourceId);
      if (!source) throw new IntakeInvalid();
      const snapshot = await importPinnedSnapshot(source.root, source.paths);
      const manifest = { schemaVersion: 1, files: snapshot.files.map(({ content: _content, ...metadata }) => metadata) };
      for (const file of snapshot.files) if (await this.putObject(client, Buffer.from(file.content, 'utf8')) !== file.sha256) throw new Error('snapshot_encoding_mismatch');
      await client.query('INSERT INTO private_snapshots (id,snapshot_hash,manifest,file_count,registered_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (snapshot_hash) DO NOTHING', [randomUUID(), snapshot.snapshotHash, manifest, snapshot.files.length, actor.id]);
      const row = (await client.query('SELECT id,snapshot_hash,file_count FROM private_snapshots WHERE snapshot_hash=$1', [snapshot.snapshotHash])).rows[0];
      if (!row) throw new Error('snapshot_unavailable');
      await client.query('INSERT INTO private_snapshot_provenance (id,snapshot_id,source_id,source_root,actor_id) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), row.id, source.id, source.root, actor.id]);
      return { id: id(row.id), snapshotHash: String(row.snapshot_hash), fileCount: Number(row.file_count) };
    });
  }
  private async snapshot(client: AuthClient, snapshotId: string): Promise<PinnedSnapshot> {
    const row = (await client.query('SELECT snapshot_hash,manifest FROM private_snapshots WHERE id=$1', [id(snapshotId)])).rows[0];
    if (!row) throw new AuthDenied();
    const manifest = SnapshotManifestSchema.parse(row.manifest);
    if (contentHash(manifest) !== row.snapshot_hash) throw new Error('snapshot_binding_mismatch');
    const files = [];
    for (const metadata of manifest.files) {
      const stored = (await client.query('SELECT payload FROM private_intake_objects WHERE sha256=$1', [metadata.sha256])).rows[0];
      const bytes = objectBytes(stored, metadata.sha256, metadata.bytes);
      const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (content.includes('\0')) throw new Error('snapshot_invalid');
      files.push(Object.freeze({ ...metadata, content }));
    }
    return Object.freeze({ schemaVersion: 1, snapshotHash: String(row.snapshot_hash), files: Object.freeze(files) });
  }
  async pinnedSnapshot(actor: SessionActor, snapshotId: string) {
    return this.transaction(actor, ['owner','requester','operator'], client => this.snapshot(client, snapshotId));
  }
  async createRequest(actor: SessionActor, input: unknown) {
    const payload = RequestInputSchema.parse(input);
    if (Buffer.byteLength(canonicalize(payload)) > 65000) throw new IntakeInvalid();
    return this.transaction(actor, ['owner','requester'], async client => {
      if (!(await client.query('SELECT id FROM private_snapshots WHERE id=$1', [payload.snapshotId])).rows[0]) throw new AuthDenied();
      const requestId = randomUUID();
      await client.query('INSERT INTO private_requests (id,snapshot_id,requester_id,payload) VALUES ($1,$2,$3,$4)', [requestId, payload.snapshotId, actor.id, payload]);
      return { id: requestId, ...payload };
    });
  }
  private async requestRow(client: AuthClient, actor: SessionActor, requestId: string, lock = false) {
    const row = (await client.query(`SELECT id,snapshot_id,payload FROM private_requests WHERE id=$1 AND (requester_id=$2 OR $3='owner')${lock ? ' FOR UPDATE' : ''}`, [id(requestId), actor.id, actor.role])).rows[0];
    if (!row) throw new AuthDenied();
    const payload = RequestInputSchema.parse(row.payload);
    if (payload.snapshotId !== row.snapshot_id) throw new Error('request_binding_mismatch');
    return { id: id(row.id), ...payload };
  }
  private async evidenceRows(client: AuthClient, requestId: string) {
    return (await client.query('SELECT id,media_type,label,byte_count,sha256 FROM private_request_evidence WHERE request_id=$1 ORDER BY created_at,id LIMIT 17', [requestId])).rows;
  }
  async request(actor: SessionActor, requestId: string) {
    return this.transaction(actor, ['owner','requester'], async client => {
      const request = await this.requestRow(client, actor, requestId);
      const evidence = await this.evidenceRows(client, requestId);
      if (evidence.length > MAX_REQUEST_EVIDENCE) throw new Error('evidence_bounds');
      return { ...request, evidence: evidence.map(row => ({ id: id(row.id), mediaType: String(row.media_type), label: String(row.label), bytes: Number(row.byte_count) })) };
    });
  }
  async upload(actor: SessionActor, requestId: string, input: unknown) {
    const parsed = EvidenceUploadSchema.parse(input);
    const decoded = Buffer.from(parsed.base64, 'base64');
    if (decoded.toString('base64') !== parsed.base64) throw new IntakeInvalid();
    let bytes: Buffer;
    try { bytes = validateEvidence(parsed.mediaType, decoded); } catch { throw new IntakeInvalid(); }
    return this.transaction(actor, ['owner','requester'], async client => {
      await this.requestRow(client, actor, requestId, true);
      const quota = (await client.query('SELECT count(*)::int AS count,coalesce(sum(byte_count),0)::int AS bytes FROM private_request_evidence WHERE request_id=$1', [requestId])).rows[0]!;
      if (Number(quota.count) >= MAX_REQUEST_EVIDENCE || Number(quota.bytes) + bytes.length > MAX_REQUEST_EVIDENCE_BYTES) throw new EvidenceLimit();
      const sha256 = await this.putObject(client, bytes), evidenceId = randomUUID();
      await client.query('INSERT INTO private_request_evidence (id,request_id,sha256,byte_count,media_type,label) VALUES ($1,$2,$3,$4,$5,$6)', [evidenceId, requestId, sha256, bytes.length, parsed.mediaType, parsed.label]);
      return { id: evidenceId, mediaType: parsed.mediaType, label: parsed.label, bytes: bytes.length };
    });
  }
  private async evidenceBytes(client: AuthClient, requestId: string, evidenceId: string) {
    const row = (await client.query(`SELECT evidence.id,evidence.media_type,evidence.sha256,evidence.byte_count,object.payload
      FROM private_request_evidence AS evidence JOIN private_intake_objects AS object ON object.sha256=evidence.sha256
      WHERE evidence.id=$1 AND evidence.request_id=$2`, [id(evidenceId), requestId])).rows[0];
    if (!row) throw new AuthDenied();
    return { id: id(row.id), mediaType: String(row.media_type), bytes: objectBytes(row, String(row.sha256), Number(row.byte_count)) };
  }
  async evidence(actor: SessionActor, requestId: string, evidenceId: string) {
    return this.transaction(actor, ['owner','requester'], async client => {
      await this.requestRow(client, actor, requestId);
      return this.evidenceBytes(client, requestId, evidenceId);
    });
  }
  async planningInput(actor: SessionActor, requestId: string) {
    return this.transaction(actor, ['owner','requester'], async client => {
      const request = await this.requestRow(client, actor, requestId);
      const snapshot = await this.snapshot(client, request.snapshotId);
      const rows = await this.evidenceRows(client, requestId);
      const evidence = [];
      for (const row of rows) evidence.push(await this.evidenceBytes(client, requestId, id(row.id)));
      const { id: requestIdValue, ...payload } = request;
      return collectPlanningEvidence({ requestId: requestIdValue, ...payload }, snapshot, evidence);
    });
  }
}
