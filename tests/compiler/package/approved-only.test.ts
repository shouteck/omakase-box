import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { projectPublicListing } from '../../../packages/contracts/public/task.js';
import { compileApprovedRelease } from '../../../packages/compiler/index.js';
import { crc32 } from '../../../packages/compiler/zip.js';
import { fullStackContract, singleUnitContract } from '../../contracts/fixtures.js';

const keys = generateKeyPairSync('ed25519');
function approved(combined = false) {
  const contract = combined ? fullStackContract(true) : singleUnitContract();
  const assets = contract.editablePaths.map(path => ({ path, contentBase64: Buffer.from(path.endsWith('.json') ? '{"schemaVersion":1}' : 'export const synthetic = true;\n').toString('base64') }));
  for (const item of contract.interfaces) {
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, id: item.schema.id })); item.schema.sha256 = byteHash(bytes);
    assets.push({ path: item.schema.path, contentBase64: bytes.toString('base64') });
  }
  const listing = projectPublicListing(contract, 30);
  const feedbackPolicy = { schemaVersion: 1, id: contract.feedbackPolicyId, categories: ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'], messageCodes: ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'], privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only' };
  const paymentTerms = { schemaVersion: 1, terminology: 'payment obligation', settlementLabel: 'settlement recorded', reward: contract.reward, terms: contract.terms };
  const manifest = { schemaVersion: 1, canonicalizationVersion: 'json-sorted-utf8/v1', taskId: contract.taskId, version: contract.version, assets: assets.map(asset => ({ path: asset.path, sha256: byteHash(Buffer.from(asset.contentBase64, 'base64')), byteSize: Buffer.from(asset.contentBase64, 'base64').length, mediaType: asset.path.endsWith('.json') ? 'application/json' : 'application/typescript', sourceAssetId: randomUUID() })), contractHash: contentHash(contract), listingHash: contentHash(listing), feedbackPolicyHash: contentHash(feedbackPolicy), paymentTermsHash: contentHash(paymentTerms), templateHash: contract.template.sha256, executionImageDigest: contract.imageDigest };
  return { manifest, manifestHash: contentHash(manifest), signature: sign(null, Buffer.from(canonicalize(manifest)), keys.privateKey).toString('base64'), contract, listing, feedbackPolicy, paymentTerms, assets };
}
function zipEntries(bytes: Uint8Array) {
  const zip = Buffer.from(bytes), files = new Map<string, Buffer>();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    expect(zip.readUInt16LE(offset + 6)).toBe(0x800);
    expect(zip.readUInt16LE(offset + 8)).toBe(0);
    expect(zip.readUInt16LE(offset + 10)).toBe(0);
    expect(zip.readUInt16LE(offset + 12)).toBe(33);
    const size = zip.readUInt32LE(offset + 18), nameSize = zip.readUInt16LE(offset + 26), extra = zip.readUInt16LE(offset + 28);
    expect(extra).toBe(0);
    const name = zip.subarray(offset + 30, offset + 30 + nameSize).toString();
    files.set(name, zip.subarray(offset + 30 + nameSize, offset + 30 + nameSize + size));
    offset += 30 + nameSize + size;
  }
  expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  expect(zip.readUInt16LE(zip.length - 12)).toBe(files.size);
  return files;
}
it('uses the standard CRC-32 vector rather than a self-defined checksum', () => { expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926); });
it.each([false, true])('compiles only signed approved bytes deterministically, combined=%s', combined => {
  const set = approved(combined);
  const result = compileApprovedRelease(set, keys.publicKey);
  expect(result.assurance).toBe('bounded');
  expect(result.runtimeReadiness).toBe('unverified');
  expect(result.sha256).toBe(byteHash(result.bytes));
  const files = zipEntries(result.bytes);
  expect([...files.keys()]).toEqual([...files.keys()].sort());
  expect(files.get('src/PlanSelector.tsx')!.toString()).toBe('export const synthetic = true;\n');
  expect(files.get('release/contract.json')!.toString()).toBe(canonicalize(set.contract));
  expect(files.get('release/manifest.json')!.toString()).toBe(canonicalize(set.manifest));
  expect(files.size).toBe(set.assets.length + 5);
  expect(Buffer.from(compileApprovedRelease({ ...structuredClone(set), assets: [...set.assets].reverse() }, keys.publicKey).bytes)).toEqual(Buffer.from(result.bytes));
});
it('Python standard-library ZIP verification independently validates CRCs, directory offsets, timestamps and regular-file permissions without extraction', () => {
  const artifact = compileApprovedRelease(approved(true), keys.publicKey);
  const check = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', 'import sys,io,zipfile,stat\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nassert z.testzip() is None\nassert z.namelist()==sorted(z.namelist())\nfor f in z.infolist():\n assert f.date_time==(1980,1,1,0,0,0)\n assert f.compress_type==zipfile.ZIP_STORED\n assert stat.S_ISREG(f.external_attr>>16)\n assert (f.external_attr>>16)&0o777==0o644\nassert z.read("src/PlanSelector.tsx")==b"export const synthetic = true;\\n"\nprint("standard_zip_verified")'], { input: artifact.bytes, encoding: 'utf8', timeout: 10000, windowsHide: true });
  expect(check.status, check.stderr).toBe(0);
  expect(check.stdout.trim()).toBe('standard_zip_verified');
});
it('two callers with identical approved content get identical artifacts without private context', () => {
  const set = approved();
  const first = compileApprovedRelease(structuredClone(set), keys.publicKey);
  const second = compileApprovedRelease(structuredClone(set), keys.publicKey);
  expect(first.sha256).toBe(second.sha256);
  expect(Buffer.from(first.bytes)).toEqual(Buffer.from(second.bytes));
  expect(() => compileApprovedRelease({ ...set, repositoryRoot: 'C:/private', privatePrompt: 'PRIVATE_CANARY' }, keys.publicKey)).toThrow('invalid_approved_release');
  expect(Buffer.from(first.bytes).includes(Buffer.from('PRIVATE_CANARY'))).toBe(false);
});
it('rejects approval/hash/key forgery and byte drift without executing or echoing source', () => {
  const set = approved();
  expect(() => compileApprovedRelease({ ...set, signature: 'A'.repeat(86) + '==' }, keys.publicKey)).toThrow();
  expect(() => compileApprovedRelease(set, generateKeyPairSync('ed25519').publicKey)).toThrow();
  expect(() => compileApprovedRelease({ ...set, manifestHash: 'f'.repeat(64) }, keys.publicKey)).toThrow();
  const changed = structuredClone(set); changed.assets[0]!.contentBase64 = Buffer.from('PRIVATE_CANARY').toString('base64');
  expect(() => compileApprovedRelease(changed, keys.publicKey)).toThrow('invalid_approved_release');
  const changedContract = structuredClone(set); changedContract.contract.title += 'changed';
  expect(() => compileApprovedRelease(changedContract, keys.publicKey)).toThrow();
});
it.each(['contractHash', 'listingHash', 'feedbackPolicyHash', 'paymentTermsHash', 'templateHash', 'executionImageDigest'])('even a re-signed inconsistent %s is rejected', field => {
  const set = approved();
  (set.manifest as unknown as Record<string, unknown>)[field] = field === 'executionImageDigest' ? 'sha256:' + 'f'.repeat(64) : 'f'.repeat(64);
  set.manifestHash = contentHash(set.manifest); set.signature = sign(null, Buffer.from(canonicalize(set.manifest)), keys.privateKey).toString('base64');
  expect(() => compileApprovedRelease(set, keys.publicKey)).toThrow();
});
it('rejects missing/extra/duplicate byte objects and missing schema assets', () => {
  const set = approved(true);
  expect(() => compileApprovedRelease({ ...set, assets: set.assets.slice(1) }, keys.publicKey)).toThrow();
  expect(() => compileApprovedRelease({ ...set, assets: [...set.assets, set.assets[0]] }, keys.publicKey)).toThrow();
  expect(() => compileApprovedRelease({ ...set, assets: [...set.assets, { path: 'extra.txt', contentBase64: '' }] }, keys.publicKey)).toThrow();
  expect(() => compileApprovedRelease({ ...set, assets: set.assets.map(asset => ({ ...asset, symlink: 'private' })) }, keys.publicKey)).toThrow();
});
it.each(['../escape', 'config/CON.json', '.git/config', '.env', 'private/secret.txt', 'node_modules/tool.js', 'src/file.js.map', 'release/manifest.json'])('rejects signed unsafe/conflicting export path %s', path => {
  const set = approved(); set.assets[0]!.path = path; set.manifest.assets[0]!.path = path;
  set.manifestHash = contentHash(set.manifest); set.signature = sign(null, Buffer.from(canonicalize(set.manifest)), keys.privateKey).toString('base64');
  expect(() => compileApprovedRelease(set, keys.publicKey)).toThrow();
});
it('rejects accessors without invocation and cannot take an asset-provider/repository capability', () => {
  const set = approved(); let touched = false;
  expect(() => compileApprovedRelease({ ...set, get fetchAssets() { touched = true; return 'private'; } }, keys.publicKey)).toThrow();
  expect(touched).toBe(false);
});
