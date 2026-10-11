import { randomUUID } from 'node:crypto';
import { receive } from '../../../services/external-api/bridge/release.js';
import { MemoryPublishedTaskPersistence, type PublishedReleaseRecord } from '../../../services/external-api/tasks/persistence.js';
import { PublishedTaskBoard } from '../../../services/external-api/tasks/board.js';
import { compiledFixture, receiverOptions } from '../publication/fixture.js';

export const baseNow = Date.parse('2026-10-04T12:00:00Z');

export interface PublishedContext {
  persistence: MemoryPublishedTaskPersistence;
  board: PublishedTaskBoard;
  record: PublishedReleaseRecord;
  taskId: string;
  taskVersion: number;
  reward: { currency: string; amountMinor: number };
  reservationDurationSeconds: number;
}

export async function publishedContext(combined = false): Promise<PublishedContext> {
  const { packet, packageBytes, input } = compiledFixture(combined);
  const persistence = new MemoryPublishedTaskPersistence();
  const options = receiverOptions();
  const receipt = await receive(packet, packageBytes, { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: baseNow + 1_000 });
  if (receipt.outcome !== 'published') throw new Error('Fixture publication failed.');
  const record = await persistence.publishedVersion(input.contract.taskId, input.contract.version);
  if (!record) throw new Error('Fixture publication record missing.');
  return {
    persistence,
    board: new PublishedTaskBoard(persistence),
    record,
    taskId: input.contract.taskId,
    taskVersion: input.contract.version,
    reward: { currency: input.contract.reward.currency, amountMinor: input.contract.reward.amountMinor },
    reservationDurationSeconds: input.contract.terms.reservationDurationSeconds
  };
}

export type Caller = { id: string; role: 'contributor' } | { id: string; role: 'owner' };

export function contributorCaller(id = randomUUID()): { id: string; role: 'contributor' } {
  return { id, role: 'contributor' };
}

export function ownerCaller(id = randomUUID()): { id: string; role: 'owner' } {
  return { id, role: 'owner' };
}

export function executorChoice(kind: 'human' | 'ai' | 'team', label: string, contributorId?: string) {
  return contributorId === undefined ? { kind, label } : { kind, label, contributorId };
}

export const customerChoice = { chosenBy: 'synthetic-customer-owner' };
export const syntheticLabel = 'Synthetic senior React contributor (component demo)';
