import { z } from 'zod';
import { isAbsolute } from 'node:path';
import { PortablePathSchema, assertDistinctPaths } from '../../../packages/contracts/paths.js';

export const MAX_UPLOAD_BYTES = 1048576;
export const MAX_REQUEST_EVIDENCE = 16;
export const MAX_REQUEST_EVIDENCE_BYTES = 8388608;
const ShortText = z.string().max(4096);
export const RequestInputSchema = z.strictObject({ snapshotId: z.uuid(), goal: ShortText.trim().min(1), currentBehaviour: ShortText.default(''), desiredBehaviour: ShortText.default(''), constraints: z.array(ShortText).max(16).default([]), exclusions: z.array(ShortText).max(16).default([]) });
export type RequestInput = z.infer<typeof RequestInputSchema>;
export const EvidenceUploadSchema = z.strictObject({ mediaType: z.enum(['text/plain', 'image/png', 'image/jpeg']), base64: z.string().min(4).max(1398104).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), label: z.string().max(160).default('') });
export const SnapshotManifestSchema = z.strictObject({ schemaVersion: z.literal(1), files: z.array(z.strictObject({ path: PortablePathSchema, bytes: z.number().int().min(0).max(MAX_UPLOAD_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(256) }).superRefine((manifest, context) => {
  try { assertDistinctPaths(manifest.files.map(file => file.path)); } catch { context.addIssue({ code: 'custom', message: 'Conflicting paths.' }); }
  if (manifest.files.reduce((sum, file) => sum + file.bytes, 0) > 16777216 || manifest.files.some((file, index) => index > 0 && manifest.files[index - 1]!.path >= file.path)) context.addIssue({ code: 'custom', message: 'Invalid snapshot ordering or size.' });
});
export type SnapshotManifest = z.infer<typeof SnapshotManifestSchema>;
export const SnapshotSourceSchema = z.strictObject({ id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/), root: z.string().max(4096).refine(isAbsolute), paths: z.array(PortablePathSchema).min(1).max(256) });
export type SnapshotSource = z.infer<typeof SnapshotSourceSchema>;
export class IntakeInvalid extends Error { constructor() { super('invalid_input'); } }
export class EvidenceLimit extends Error { constructor() { super('evidence_limit'); } }
