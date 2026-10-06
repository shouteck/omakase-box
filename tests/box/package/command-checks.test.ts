import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgreementInvalid, BoxManifestSchema, CheckOutsideRoot, ExportFailed, parseAgreement, runDeclaredCheck, verifySubmission } from '../../../packages/box-package/index.js';
import type { CommandCheck } from '../../../packages/box-package/index.js';
import { agreementFile, copyBox, ownerRepo, PNPM_CJS, requirePnpmTooling, runExport, runRoot, runSubmitTool } from './support.js';

requirePnpmTooling();

const HEAVY = 600_000;
const EDITABLE = 'src/config/response-security.json';
const HARDENED = '{"schemaVersion":1,"frameAncestors":"none","noSniff":true,"referrerPolicy":"no-referrer","hsts":{"enabled":true,"maxAgeSeconds":31536000,"includeSubDomains":false}}';
const PNPM = { command: process.execPath, args: [PNPM_CJS] };

const check = (over: Partial<CommandCheck>): CommandCheck => ({
  name: 'probe', tool: 'node', args: ['-e', 'process.exit(0)'], cwd: '.',
  context: 'owner', role: 'guard', timeoutMs: 30_000, ...over
});

// The agreement shape is a strict subset of the fixture agreements: only the
// fields the schema boundary cares about, exercised directly.
function agreementWith(over: Record<string, unknown>): unknown {
  return {
    schemaVersion: 1,
    box: { id: 'probe-box', name: 'probe', version: 1 },
    outcome: 'probe',
    sourceRoot: '.',
    entrypoints: ['src/policy/loader.ts'],
    editable: [{ kind: 'copy', owner: 'config/response-security.json', box: EDITABLE }],
    declaredDependencies: {},
    excludedPrefixes: ['src/private/', 'node_modules/'],
    toolchain: { node: '>=24', pnpm: '10.34.5', typescript: '6.0.3', vitest: '5.0.1', typesNode: '24.13.6' },
    checks: ['probe'],
    evaluator: [],
    submission: { format: 'editable-overlay', instructions: 'probe' },
    ...over
  };
}

describe('declared command checks: agreement boundary', () => {
  it('accepts command descriptors and defaults legacy fields', () => {
    const agreement = parseAgreement(agreementWith({ commands: [check({ name: 'a', role: 'outcome' })] }));
    expect(agreement.commands[0]).toMatchObject({ name: 'a', role: 'outcome', context: 'owner', timeoutMs: 30_000 });
    expect(agreement.evaluator).toEqual([]);
  });

  it('rejects an agreement with neither evaluator nor commands', () => {
    expect(() => parseAgreement(agreementWith({}))).toThrowError(AgreementInvalid);
    expect(() => parseAgreement(agreementWith({ commands: [] }))).toThrowError(AgreementInvalid);
  });

  it('rejects an unpinned tool, a non-portable cwd, an empty name and an out-of-range timeout', () => {
    const bad: Array<Record<string, unknown>> = [
      { ...check({}), tool: 'sh' },
      { ...check({}), cwd: '../outside' },
      { ...check({}), name: '' },
      { ...check({}), timeoutMs: 0 },
      { ...check({}), timeoutMs: 600_001 }
    ];
    for (const command of bad) {
      expect(() => parseAgreement(agreementWith({ commands: [command] }))).toThrowError(AgreementInvalid);
    }
  });
});

describe('declared command checks: runner', () => {
  it('records exit, role, context, log tail and seconds verbatim (no shell)', () => {
    const record = runDeclaredCheck(check({ name: 'echo-probe', args: ['-e', 'console.log("left $SHELL `id`"); process.exit(3)'] }), process.cwd(), PNPM);
    expect(record.result).toBe('fail');
    expect(record.exit).toBe(3);
    expect(record.role).toBe('guard');
    expect(record.log).toContain('left $SHELL `id`');
    expect(record.seconds).toBeGreaterThanOrEqual(0);
  });

  it('runs in a declared subdirectory and refuses a link that escapes the root', () => {
    const root = runRoot('ctx');
    mkdirSync(join(root, 'sub'), { recursive: true });
    const record = runDeclaredCheck(check({ cwd: 'sub' }), root, PNPM);
    expect(record.result).toBe('pass');
    expect(record.cwd).toBe('sub');

    const outside = runRoot('outside');
    symlinkSync(outside, join(root, 'link'), 'junction');
    expect(() => runDeclaredCheck(check({ cwd: 'link' }), root, PNPM)).toThrowError(CheckOutsideRoot);
  });

  it('names a timeout, never a pass', () => {
    const record = runDeclaredCheck(check({ args: ['-e', 'setTimeout(() => {}, 5000)'], timeoutMs: 500 }), process.cwd(), PNPM);
    expect(record.result).not.toBe('pass');
    expect(['timeout', 'error']).toContain(record.result);
  });
});

describe('declared command checks: export on the untouched base', () => {
  it('records each base result and warns when no outcome check is red', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.commands = [
          check({ name: 'base-guard', role: 'guard' }),
          check({ name: 'base-outcome', role: 'outcome', args: ['-e', 'process.exit(1)'] })
        ];
      }
    });
    const manifest = BoxManifestSchema.parse(JSON.parse(readFileSync(join(runExport(agreement).outDir, 'box.json'), 'utf8')));
    expect(manifest.baseChecks.map(record => `${record.name}:${record.result}:${record.exit}`)).toEqual(['base-guard:pass:0', 'base-outcome:fail:1']);
    // The legacy 'checks' strings are descriptions: named unsupported gap, never a claim.
    expect(manifest.warnings).toEqual([expect.stringMatching(/legacy 'checks'/)]);
    expect(manifest.commands[0]?.tool).toBe('node');

    const green = agreementFile('request-a', { mutate: value => { value.commands = [check({ name: 'only-green', role: 'outcome' })]; } });
    const warned = BoxManifestSchema.parse(JSON.parse(readFileSync(join(runExport(green).outDir, 'box.json'), 'utf8')));
    expect(warned.warnings.some(warning => /cannot evidence change/.test(warning))).toBe(true);
  });

  it('records recipient-context base results on the installed staged Box', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.commands = [
          check({ name: 'pkg-guard', context: 'recipient', role: 'guard' }),
          check({ name: 'pkg-outcome', context: 'recipient', role: 'outcome', args: ['-e', 'process.exit(1)'] })
        ];
      }
    });
    const manifest = BoxManifestSchema.parse(JSON.parse(readFileSync(join(runExport(agreement).outDir, 'box.json'), 'utf8')));
    expect(manifest.baseChecks.map(record => `${record.context}:${record.name}:${record.result}`)).toEqual(['recipient:pkg-guard:pass', 'recipient:pkg-outcome:fail']);
  });

  it('refuses when a recipient-context guard fails on the staged Box, owner checks green or not', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.commands = [
          check({ name: 'owner-ok' }),
          // A runtime-path gap in the package: the guard names a file the Box
          // never shipped, so it fails inside the staged folder.
          check({ name: 'pkg-missing', context: 'recipient', args: ['src/definitely-not-shipped.js'] })
        ];
      }
    });
    expect(() => runExport(agreement)).toThrowError(ExportFailed);
  });

  it('keeps a legacy evaluator-only agreement exporting, with the named gap recorded', () => {
    const manifest = BoxManifestSchema.parse(JSON.parse(readFileSync(join(runExport(agreementFile('request-a')).outDir, 'box.json'), 'utf8')));
    expect(manifest.baseChecks).toEqual([]);
    expect(manifest.warnings).toEqual([expect.stringMatching(/legacy 'checks'/)]);
    expect(manifest.evaluator).toHaveLength(1);
  });

  it('refuses to export when a declared guard is red on the untouched base', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.commands = [check({ name: 'red-guard', args: ['-e', 'process.exit(7)'] })]; }
    });
    expect(() => runExport(agreement)).toThrowError(ExportFailed);
  });
});

describe('declared command checks: owner verify in the scratch clone', () => {
  // Generic request-agnostic fixture: the outcome command reads the APPLIED
  // editable in the clone — green only when the submitted bytes carry the
  // hardened marker, so a no-op and the pre-change base both stay red.
  const cloneGuard = check({ name: 'clone-layout', args: ['-e', `process.exit(require('fs').existsSync('examples/private-shop/package.json')?0:1)`] });
  const appliedOutcome = check({
    name: 'applied-content', role: 'outcome',
    args: ['-e', `process.exit(require('fs').readFileSync('examples/private-shop/config/response-security.json','utf8').includes('no-referrer')?0:1)`]
  });

  function commandAgreement() {
    return agreementFile('request-a', {
      baseCommit: ownerRepo().baseCommit,
      mutate: value => { value.evaluator = []; value.commands = [cloneGuard, appliedOutcome]; }
    });
  }
  function sealed(edit?: (dir: string) => void) {
    const agreementPath = commandAgreement();
    const exported = runExport(agreementPath, ownerRepo().repo);
    const dir = copyBox(exported.outDir, 'command-box');
    edit?.(dir);
    expect(runSubmitTool(dir).status).toBe(0);
    return { agreementPath, dir };
  }
  function verify(submissionPath: string, agreementPath: string) {
    return verifySubmission({ submissionPath, agreementPath, repoPath: ownerRepo().repo, pnpm: PNPM, workRoot: runRoot('verify-scratch') });
  }

  it('fails a no-op submission: the untouched-base red outcome stays red', { timeout: HEAVY }, () => {
    const { agreementPath, dir } = sealed();
    const report = verify(join(dir, 'submission.json'), agreementPath);
    expect(report.verdict).toBe('fail');
    expect(report.failureClass).toBe('implementation-failure');
    expect(report.reason).toBe('command-check');
    expect(report.commandChecks?.map(record => `${record.name}:${record.result}`)).toEqual(['clone-layout:pass', 'applied-content:fail']);
  });

  it('passes when the applied edit turns the declared outcome green', { timeout: HEAVY }, () => {
    const { agreementPath, dir } = sealed(d => writeFileSync(join(d, EDITABLE), HARDENED));
    const report = verify(join(dir, 'submission.json'), agreementPath);
    expect(report.verdict, JSON.stringify(report.commandChecks)).toBe('pass');
    expect(report.commandChecks?.every(record => record.result === 'pass')).toBe(true);
  });
});
