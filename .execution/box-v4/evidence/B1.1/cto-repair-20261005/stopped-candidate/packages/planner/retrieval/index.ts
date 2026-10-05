import type { PinnedSnapshot } from '../../../services/private-api/snapshots/importer.js';

export interface PlanningRequest { requestId: string; snapshotId: string; goal: string; currentBehaviour: string; desiredBehaviour: string; constraints: readonly string[]; exclusions: readonly string[] }
export interface PrivateAttachment { id: string; mediaType: string; bytes: Buffer }
export function collectPlanningEvidence(request: PlanningRequest, snapshot: PinnedSnapshot, evidence: readonly PrivateAttachment[]) {
  if (snapshot.files.length > 256 || evidence.length > 16) throw new Error('retrieval_bounds');
  let remaining = 65536;
  function bounded(text: string) {
    let result = '', consumed = 0;
    for (const character of text) {
      const size = Buffer.byteLength(character);
      if (size > remaining) break;
      result += character; remaining -= size; consumed += character.length;
    }
    return { text: result, truncated: consumed < text.length };
  }
  const reference = (evidenceId: string, location: string) => ({ evidenceId, snapshotHash: snapshot.snapshotHash, location });
  const sources = snapshot.files.map(file => ({ reference: reference(request.snapshotId, file.path), sha256: file.sha256, ...bounded(file.content) }));
  const attachments = evidence.map(item => ({ reference: reference(item.id, `request-evidence/${item.id}`), mediaType: item.mediaType, ...(item.mediaType === 'text/plain' ? bounded(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(item.bytes)) : { text: null, truncated: false }) }));
  return { assurance: 'bounded' as const, request: { ...request, constraints: [...request.constraints], exclusions: [...request.exclusions] }, snapshotHash: snapshot.snapshotHash, sources, attachments, imageUnderstanding: false as const, textByteLimit: 65536 };
}
