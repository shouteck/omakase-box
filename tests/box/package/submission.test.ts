import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BoxManifestSchema, SubmissionArtifactSchema, validateSubmission } from '../../../packages/box-package/index.js';
import { agreementFile, copyBox, FIXTURE, fixtureRepo, requirePnpmTooling, runExport, runRoot, runSubmitTool } from './support.js';

requirePnpmTooling();

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const HARDENED = '{"schemaVersion":1,"frameAncestors":"none","noSniff":true,"referrerPolicy":"no-referrer","hsts":{"enabled":true,"maxAgeSeconds":31536000,"includeSubDomains":false}}';
const EDITABLE = 'src/config/response-security.json';

function manifestOf(dir: string) {
  return BoxManifestSchema.parse(JSON.parse(readFileSync(join(dir, 'box.json'), 'utf8')));
}
function artifactOf(dir: string, outName = 'submission.json') {
  return SubmissionArtifactSchema.parse(JSON.parse(readFileSync(join(dir, outName), 'utf8')));
}

// The recipient path end to end: export, work in a copied folder exactly like the blind
// taster will, run the emitted tool, return everything the owner-side check needs.
function workedBox(name: 'request-a' | 'request-b', edit?: (dir: string) => void) {
  const agreementPath = agreementFile(name);
  const exported = runExport(agreementPath);
  const dir = copyBox(exported.outDir, `submit-${name}`);
  edit?.(dir);
  const run = runSubmitTool(dir);
  return { agreementPath, exported, dir, run };
}
function validate(submissionPath: string, agreementPath: string, extra: { boxDir?: string; baseCommit?: string } = {}) {
  return validateSubmission({ submissionPath, agreementPath, repoPath: fixtureRepo().repo, ...extra });
}
function mutateArtifact(dir: string, mutate: (artifact: Record<string, unknown>) => void): string {
  const artifact = JSON.parse(readFileSync(join(dir, 'submission.json'), 'utf8')) as Record<string, unknown>;
  mutate(artifact);
  const path = join(runRoot('mutant'), 'submission.json');
  writeFileSync(path, JSON.stringify(artifact));
  return path;
}
function editConfig(dir: string): void {
  writeFileSync(join(dir, EDITABLE), HARDENED);
}

describe('in-box submit tool', () => {
  it('seals edited editable files into an artifact bound to the box', () => {
    const { dir, run } = workedBox('request-a', editConfig);
    expect(run.status, run.stderr).toBe(0);
    const artifact = artifactOf(dir);
    const manifest = manifestOf(dir);
    expect(artifact.box).toEqual(manifest.box);
    expect(artifact.baseCommit).toBe(manifest.baseCommit);
    expect(artifact.agreementSha256).toBe(manifest.agreementSha256);
    expect(artifact.boxJsonSha256).toBe(sha256(readFileSync(join(dir, 'box.json'))));
    expect(artifact.files).toHaveLength(1);
    const [file] = artifact.files;
    expect(file?.box).toBe(EDITABLE);
    expect(file?.owner).toBe('config/response-security.json');
    expect(file?.sha256).toBe(sha256(HARDENED));
    expect(file?.baselineSha256).toBe(sha256(readFileSync(join(FIXTURE, 'config/response-security.json'))));
    expect(file?.content).toBe(HARDENED);
  });

  it('honours an explicit output path', () => {
    const { dir } = workedBox('request-a');
    const run = runSubmitTool(dir, 'out/sub.json');
    expect(run.status, run.stderr).toBe(0);
    expect(artifactOf(dir, join('out', 'sub.json')).files).toHaveLength(1);
  });

  it('refuses when a read-only file was modified', () => {
    const { dir } = workedBox('request-a', d => writeFileSync(join(d, 'src/policy/loader.ts'), '// tampered read-only file'));
    const run = runSubmitTool(dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/read-only file src\/policy\/loader\.ts was modified/);
  });

  it('refuses when an editable file is missing', () => {
    // The editable is also a recorded manifest file, so the integrity seal names it
    // first — either refusal is correct; what matters is the tool refuses and names it.
    const { dir } = workedBox('request-a', d => rmSync(join(d, EDITABLE)));
    const run = runSubmitTool(dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/src\/config\/response-security\.json is missing/);
  });
});

describe('owner-side submission validation', () => {
  it('accepts a valid submission and maps it back to the owner path', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const report = validate(join(dir, 'submission.json'), agreementPath);
    expect(report).toMatchObject({
      accepted: true,
      box: { id: 'private-shop-request-a', version: 1 },
      baseCommit: fixtureRepo().baseCommit,
      baseSource: 'agreement'
    });
    expect(report.applies).toEqual([
      { owner: 'config/response-security.json', box: EDITABLE, changed: true, sha256: sha256(HARDENED), bytes: Buffer.byteLength(HARDENED) }
    ]);
  });

  it('accepts a no-change submission', () => {
    const { agreementPath, dir } = workedBox('request-a');
    const report = validate(join(dir, 'submission.json'), agreementPath);
    expect(report.accepted, report.detail).toBe(true);
    expect(report.applies?.[0]?.changed).toBe(false);
  });

  it('accepts a request B submission sealed against the generated scaffold baseline', () => {
    const { agreementPath, dir } = workedBox('request-b', d => writeFileSync(join(d, 'src/ranking/rankItems.ts'), `${readFileSync(join(d, 'src/ranking/rankItems.ts'), 'utf8')}// recipient change`));
    const report = validate(join(dir, 'submission.json'), agreementPath);
    expect(report.accepted, report.detail).toBe(true);
    expect(report.applies).toEqual([expect.objectContaining({ owner: 'src/ranking/rankItems.ts', box: 'src/ranking/rankItems.ts', changed: true })]);
  });

  it('rejects an artifact that is not JSON', () => {
    const { agreementPath } = workedBox('request-a');
    const path = join(runRoot('bad'), 'submission.json');
    writeFileSync(path, 'this is not json');
    const report = validate(path, agreementPath);
    expect(report).toMatchObject({ accepted: false, reason: 'malformed-submission' });
  });

  it('rejects an artifact missing a required field', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const path = mutateArtifact(dir, artifact => { delete artifact.baseCommit; });
    const report = validate(path, agreementPath);
    expect(report).toMatchObject({ accepted: false, reason: 'malformed-submission' });
  });

  it('rejects an artifact whose file sha256 does not match its content', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const path = mutateArtifact(dir, artifact => {
      (artifact.files as Array<Record<string, unknown>>)[0]!.sha256 = '0'.repeat(64);
    });
    const report = validate(path, agreementPath);
    expect(report).toMatchObject({ accepted: false, reason: 'malformed-submission' });
  });

  it('rejects the wrong box id', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const path = mutateArtifact(dir, artifact => { (artifact.box as Record<string, unknown>).id = 'private-shop-request-b'; });
    expect(validate(path, agreementPath)).toMatchObject({ accepted: false, reason: 'box-mismatch' });
  });

  it('rejects the wrong box version', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const path = mutateArtifact(dir, artifact => { (artifact.box as Record<string, unknown>).version = 2; });
    expect(validate(path, agreementPath)).toMatchObject({ accepted: false, reason: 'box-mismatch' });
  });

  it('rejects the wrong base commit', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const path = mutateArtifact(dir, artifact => { artifact.baseCommit = '0'.repeat(40); });
    const report = validate(path, agreementPath);
    expect(report).toMatchObject({ accepted: false, reason: 'base-commit-mismatch' });
  });

  it('rejects a submission sealed against an altered agreement', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const forged = mutateArtifact(dir, artifact => { artifact.agreementSha256 = 'f'.repeat(64); });
    expect(validate(forged, agreementPath)).toMatchObject({ accepted: false, reason: 'agreement-mismatch' });
    // And an honest artifact cannot be replayed against a different agreement file.
    const otherAgreement = agreementFile('request-a', { mutate: value => { value.outcome = 'Do something else entirely.'; } });
    expect(validate(join(dir, 'submission.json'), otherAgreement)).toMatchObject({ accepted: false, reason: 'agreement-mismatch' });
  });

  it('rejects a file outside the editable surface', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const path = mutateArtifact(dir, artifact => {
      (artifact.files as Array<Record<string, unknown>>).push({ box: 'src/policy/loader.ts', owner: 'src/policy/loader.ts', baselineSha256: null, sha256: sha256('x'), content: 'x' });
    });
    expect(validate(path, agreementPath)).toMatchObject({ accepted: false, reason: 'outside-editable' });
  });

  it('rejects a submission that remaps the owner path', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const path = mutateArtifact(dir, artifact => { (artifact.files as Array<Record<string, unknown>>)[0]!.owner = 'src/other.json'; });
    expect(validate(path, agreementPath)).toMatchObject({ accepted: false, reason: 'agreement-mismatch' });
  });

  it('rejects an incomplete submission that omits a declared editable', () => {
    // A two-editable agreement against the real fixture repo: the artifact covers only
    // the config file, so strict-json is missing from the contribution surface.
    const agreementPath = agreementFile('request-a', {
      mutate: value => { (value.editable as unknown[]).push({ kind: 'copy', owner: 'src/policy/strict-json.ts', box: 'src/policy/strict-json.ts' }); }
    });
    const artifact = {
      schemaVersion: 1,
      format: 'editable-overlay',
      box: { id: 'private-shop-request-a', name: 'Strengthen the response security policy', version: 1 },
      baseCommit: fixtureRepo().baseCommit,
      agreementSha256: sha256(readFileSync(agreementPath)),
      boxJsonSha256: '0'.repeat(64),
      files: [{ box: EDITABLE, owner: 'config/response-security.json', baselineSha256: sha256(readFileSync(join(FIXTURE, 'config/response-security.json'))), sha256: sha256(HARDENED), content: HARDENED }]
    };
    const path = join(runRoot('partial'), 'submission.json');
    writeFileSync(path, JSON.stringify(artifact));
    expect(validate(path, agreementPath)).toMatchObject({ accepted: false, reason: 'missing-editable' });
  });

  it('rejects a baseline that does not match the owner blob at the base commit', () => {
    const { agreementPath, dir } = workedBox('request-a', editConfig);
    const path = mutateArtifact(dir, artifact => { (artifact.files as Array<Record<string, unknown>>)[0]!.baselineSha256 = '0'.repeat(64); });
    expect(validate(path, agreementPath)).toMatchObject({ accepted: false, reason: 'baseline-mismatch' });
  });

  it('verifies the sealed manifest hash against a retained export', () => {
    const { agreementPath, exported, dir } = workedBox('request-a', editConfig);
    // The owner kept the pristine export: the recipient saw the same box.json.
    expect(validate(join(dir, 'submission.json'), agreementPath, { boxDir: exported.outDir }).accepted).toBe(true);
    // A different box.json (here, request B's export) must not match the seal.
    const other = runExport(agreementFile('request-b'));
    const report = validate(join(dir, 'submission.json'), agreementPath, { boxDir: other.outDir });
    expect(report).toMatchObject({ accepted: false, reason: 'box-json-mismatch' });
  });
});
