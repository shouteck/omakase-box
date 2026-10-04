import assert from 'node:assert/strict';
import { createPublicKey, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { byteHash, canonicalize } from '../../../packages/contracts/hash.js';
import { receive } from './release.js';
import { BridgeRejected } from './types.js';
import { PUBLISHED_TASK_DDL } from '../tasks/ddl.js';
import { PublishedReleaseStore } from '../tasks/published-store.js';
import { PublishedTaskBoard } from '../tasks/board.js';

interface ReceiveContextKeys {
  releaseVerificationKeyPem: string;
  bridgeVerificationKeyPem: string;
}

/**
 * Container-side durable acceptance fixture: a real isolated synthetic
 * external PostgreSQL database, the published-task DDL and the exact signed
 * transport flow including replay, conflict, board and retrieval checks. The
 * divergent/conflict packets are pre-signed before entry; the external side
 * only holds public keys and its own database credentials here.
 */
export async function runBridgeReceiveFixture(input: {
  keys: ReceiveContextKeys;
  packet: unknown;
  packageBytesBase64: string;
  replayPacket: unknown;
  conflictPacket: unknown;
  conflictPackageBase64: string;
}): Promise<Record<string, unknown>> {
  const database = `synthetic_bridge_${randomBytes(16).toString('hex')}`;
  assert.match(database, /^synthetic_bridge_[a-f0-9]{32}$/);
  const configuration = { host: process.env.EXTERNAL_DATABASE_HOST, user: process.env.EXTERNAL_DATABASE_USER, password: readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 3 };
  const admin = new Pool({ ...configuration, database: process.env.EXTERNAL_DATABASE_NAME });
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();
  const pool = new Pool({ ...configuration, database });
  const report: Record<string, unknown> = { assurance: 'tested' as const, database, realCustomerData: false };
  try {
    await pool.query(PUBLISHED_TASK_DDL);
    const store = new PublishedReleaseStore(pool);
    const packageBytes = Buffer.from(input.packageBytesBase64, 'base64');
    const now = Date.now();
    const receiveContext = {
      releaseKey: createPublicKey(input.keys.releaseVerificationKeyPem),
      bridgeKey: createPublicKey(input.keys.bridgeVerificationKeyPem),
      claimReplay: (claim: { eventId: string; nonce: string; payloadHash: string; expiresAt: string }) => store.claimReplay(claim),
      persistence: store,
      now
    };
    const accepted = await receive(input.packet, packageBytes, receiveContext);
    report.published = accepted.outcome === 'published';
    const board = new PublishedTaskBoard(store);
    const entries = await board.entries();
    report.boardEntries = entries.length;
    report.entryTitle = entries[0]?.title;
    const scope = await board.scope(accepted.taskId, accepted.version);
    report.scopeUnits = [...scope.workUnits.map(unit => unit.id)].sort();
    report.scopeDisciplines = [...scope.disciplines].sort();
    report.scopeReward = { currency: scope.reward.currency, amountMinor: scope.reward.amountMinor };
    const replayed = await receive(input.packet, packageBytes, receiveContext);
    report.duplicate = replayed.outcome === 'duplicate' && (await board.entries()).length === 1;
    const claimRow = (await pool.query('SELECT payload_hash FROM external_bridge_claims LIMIT 1')).rows[0] as { payload_hash: string } | undefined;
    report.claimRows = (await pool.query('SELECT event_id FROM external_bridge_claims')).rows.length;
    report.payloadHashBindsDelivered = claimRow?.payload_hash === byteHash(Buffer.from(canonicalize(input.packet), 'utf8'));
    const replayFault = await receiveFault(input.replayPacket, packageBytes, receiveContext);
    report.replay = replayFault === 'replay';
    const conflictFault = await receiveFault(input.conflictPacket, Buffer.from(input.conflictPackageBase64, 'base64'), receiveContext);
    report.conflict = conflictFault === 'task_conflict';
    let guardsFailing = true;
    try { await pool.query('UPDATE external_published_tasks SET package_sha256 = package_sha256'); guardsFailing = false; } catch { guardsFailing = true; }
    try { await pool.query('DELETE FROM external_bridge_claims'); guardsFailing = false; } catch { guardsFailing = true; }
    report.immutableGuards = guardsFailing;
    const fetched = await board.package(accepted.taskId, accepted.version);
    report.packageValidated = byteHash(fetched.bytes) === fetched.sha256 && fetched.bytes.length === packageBytes.length;
    report.retainedAfterGuards = (await board.entries()).length === 1;
    return report;
  } catch (error) {
    report.failure = error instanceof BridgeRejected ? error.code : error instanceof Error ? error.message : 'fixture_failure';
    report.assurance = 'unverified' as const;
    return report;
  } finally {
    await pool.end();
  }
}

async function receiveFault(packet: unknown, packageBytes: Uint8Array, context: { releaseKey: unknown; bridgeKey: unknown; claimReplay: unknown; persistence: unknown; now: number }): Promise<string | null> {
  try {
    await receive(packet, packageBytes, context as never);
    return null;
  } catch (error) {
    return error instanceof BridgeRejected ? error.code : 'unexpected';
  }
}
