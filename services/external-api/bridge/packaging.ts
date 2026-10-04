import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import type { ApprovedReleaseManifest, ExternalTaskContract, PublicListing } from '../../../packages/contracts/public/index.js';
import { BridgeRejected } from './types.js';

/**
 * Reader and validator for the approved-only deterministic package produced by
 * packages/compiler (deterministicZip with release/ metadata entries). The
 * bytes are never executed: only the fixed stored-entry layout is decoded,
 * bound against manifest descriptors and released metadata digests, then used
 * for exact retrieval checks. Any deviation fails closed.
 */
const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const EOCD_BYTES = 22;
const MAX_ENTRIES = 2048;
const MAX_PACKAGE_BYTES = 134217728;

const METADATA_ENTRIES = ['release/contract.json', 'release/feedback-policy.json', 'release/listing.json', 'release/manifest.json', 'release/payment-terms.json'] as const;

function integrity(reason: 'package_integrity'): never {
  throw new BridgeRejected(reason);
}

export function decodeDeterministicPackage(packageBytes: Uint8Array): Map<string, Uint8Array> {
  if (!(packageBytes instanceof Uint8Array) || packageBytes.length === 0 || packageBytes.length > MAX_PACKAGE_BYTES) integrity('package_integrity');
  const zip = Buffer.from(packageBytes.buffer as ArrayBuffer, packageBytes.byteOffset, packageBytes.byteLength);
  const entries = new Map<string, Uint8Array>();
  const localEntries = new Map<string, { name: string; offset: number; size: number; crc: number; headerEnd: number }>();
  let offset = 0;
  let count = 0;
  for (;;) {
    if (offset + LOCAL_HEADER_BYTES > zip.length) integrity('package_integrity');
    if (zip.readUInt32LE(offset) !== 0x04034b50) break;
    if (zip.readUInt16LE(offset + 4) !== 20 || zip.readUInt16LE(offset + 6) !== 0x800 || zip.readUInt16LE(offset + 8) !== 0 || zip.readUInt16LE(offset + 10) !== 0 || zip.readUInt16LE(offset + 12) !== 33) integrity('package_integrity');
    const crc = zip.readUInt32LE(offset + 14);
    const size = zip.readUInt32LE(offset + 18);
    const storedSize = zip.readUInt32LE(offset + 22);
    const nameLength = zip.readUInt16LE(offset + 26);
    if (zip.readUInt16LE(offset + 24) !== 0 || zip.readUInt16LE(offset + 28) !== 0 || nameLength === 0) integrity('package_integrity');
    if (size !== storedSize || size > MAX_PACKAGE_BYTES) integrity('package_integrity');
    const nameStart = offset + LOCAL_HEADER_BYTES;
    const nameEnd = nameStart + nameLength;
    const bodyEnd = nameEnd + size;
    if (bodyEnd > zip.length) integrity('package_integrity');
    const name = zip.subarray(nameStart, nameEnd).toString('utf8');
    if (!/^[A-Za-z0-9_./-]+$/.test(name) || name.includes('\\') || name.endsWith('/')) integrity('package_integrity');
    if (localEntries.has(name.toLowerCase())) integrity('package_integrity');
    const bytes = zip.subarray(nameEnd, bodyEnd);
    localEntries.set(name.toLowerCase(), { name, offset, size, crc, headerEnd: offset + LOCAL_HEADER_BYTES });
    entries.set(name, Buffer.from(bytes));
    count += 1;
    if (count > MAX_ENTRIES) integrity('package_integrity');
    offset = bodyEnd;
  }
  const directoryStart = offset;
  let directoryOffset = offset;
  let directoryEntries = 0;
  for (;;) {
    if (directoryOffset + 4 > zip.length) integrity('package_integrity');
    if (zip.readUInt32LE(directoryOffset) !== 0x02014b50) break;
    if (directoryOffset + CENTRAL_HEADER_BYTES > zip.length) integrity('package_integrity');
    if (zip.readUInt16LE(directoryOffset + 8) !== 0x800 || zip.readUInt16LE(directoryOffset + 10) !== 0 || zip.readUInt16LE(directoryOffset + 12) !== 0 || zip.readUInt16LE(directoryOffset + 14) !== 33) integrity('package_integrity');
    const madeBy = zip.readUInt16LE(directoryOffset + 4);
    if (madeBy !== ((3 << 8) | 20) || zip.readUInt16LE(directoryOffset + 6) !== 20) integrity('package_integrity');
    const crc = zip.readUInt32LE(directoryOffset + 16);
    const size = zip.readUInt32LE(directoryOffset + 20);
    const storedSize = zip.readUInt32LE(directoryOffset + 24);
    const nameLength = zip.readUInt16LE(directoryOffset + 28);
    if (zip.readUInt16LE(directoryOffset + 30) !== 0 || zip.readUInt16LE(directoryOffset + 32) !== 0 || zip.readUInt16LE(directoryOffset + 34) !== 0 || zip.readUInt16LE(directoryOffset + 36) !== 0) integrity('package_integrity');
    if (zip.readUInt32LE(directoryOffset + 38) !== ((0o100644 << 16) >>> 0)) integrity('package_integrity');
    const localOffset = zip.readUInt32LE(directoryOffset + 42);
    if (size !== storedSize) integrity('package_integrity');
    const local = localEntries.get(zip.subarray(directoryOffset + CENTRAL_HEADER_BYTES, directoryOffset + CENTRAL_HEADER_BYTES + nameLength).toString('utf8').toLowerCase());
    if (!local || local.offset !== localOffset || local.size !== size || local.crc !== crc) integrity('package_integrity');
    directoryEntries += 1;
    if (directoryEntries > MAX_ENTRIES) integrity('package_integrity');
    directoryOffset += CENTRAL_HEADER_BYTES + nameLength;
  }
  if (count !== directoryEntries || directoryEntries === 0) integrity('package_integrity');
  const directoryEnd = directoryOffset;
  if (directoryEnd + EOCD_BYTES !== zip.length) integrity('package_integrity');
  if (zip.readUInt32LE(directoryEnd) !== 0x06054b50) integrity('package_integrity');
  if (zip.readUInt16LE(directoryEnd + 4) !== 0 || zip.readUInt16LE(directoryEnd + 6) !== 0) integrity('package_integrity');
  const eocdCount = zip.readUInt16LE(directoryEnd + 8);
  if (eocdCount !== count || zip.readUInt16LE(directoryEnd + 10) !== count) integrity('package_integrity');
  if (zip.readUInt32LE(directoryEnd + 12) !== directoryEnd - directoryStart) integrity('package_integrity');
  if (zip.readUInt32LE(directoryEnd + 16) !== directoryStart) integrity('package_integrity');
  if (zip.readUInt16LE(directoryEnd + 20) !== 0) integrity('package_integrity');
  for (const [name, bytes] of entries) {
    const local = localEntries.get(name.toLowerCase())!;
    if (crc32(bytes) !== local.crc) integrity('package_integrity');
    if (name !== local.name) integrity('package_integrity');
  }
  return entries;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

export function validateReleasedPackage(entries: Map<string, Uint8Array>, release: { manifest: ApprovedReleaseManifest; contract: ExternalTaskContract; listing: PublicListing }): void {
  const companions = new Set(METADATA_ENTRIES);
  const expected = new Set<string>([...release.manifest.assets.map(asset => asset.path), ...companions]);
  if (entries.size !== expected.size || entries.size < companions.size + release.manifest.assets.length) throw new BridgeRejected('asset_mismatch');
  const canonicalManifest = Buffer.from(canonicalize(release.manifest), 'utf8');
  const canonicalContract = Buffer.from(canonicalize(release.contract), 'utf8');
  const canonicalListing = Buffer.from(canonicalize(release.listing), 'utf8');
  for (const asset of release.manifest.assets) {
    const bytes = entries.get(asset.path);
    if (!bytes) throw new BridgeRejected('asset_mismatch');
    if (byteHash(bytes) !== asset.sha256 || bytes.length !== asset.byteSize) throw new BridgeRejected('asset_mismatch');
  }
  if (!Buffer.from(entries.get('release/manifest.json') ?? new Uint8Array(0)).equals(canonicalManifest)) throw new BridgeRejected('asset_mismatch');
  if (!Buffer.from(entries.get('release/contract.json') ?? new Uint8Array(0)).equals(canonicalContract)) throw new BridgeRejected('asset_mismatch');
  if (!Buffer.from(entries.get('release/listing.json') ?? new Uint8Array(0)).equals(canonicalListing)) throw new BridgeRejected('asset_mismatch');
  assertPolicyCanonical(entries.get('release/feedback-policy.json'), release.manifest.feedbackPolicyHash);
  assertPolicyCanonical(entries.get('release/payment-terms.json'), release.manifest.paymentTermsHash);
}

function assertPolicyCanonical(bytes: Uint8Array | undefined, expectedHash: string): void {
  if (!bytes || bytes.length === 0) throw new BridgeRejected('asset_mismatch');
  const parsed = (() => {
    try { return JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw new BridgeRejected('asset_mismatch'); }
  })();
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new BridgeRejected('asset_mismatch');
  if (!(Buffer.from(bytes).equals(Buffer.from(canonicalize(parsed), 'utf8')) && contentHash(parsed) === expectedHash)) throw new BridgeRejected('asset_mismatch');
}
