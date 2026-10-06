import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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
  name: 'probe', program: 'node', args: ['-e', 'process.exit(0)'], cwd: '.',
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
    files: [{ owner: 'src/policy/loader.ts' }, { owner: 'src/policy/strict-json.ts' }],
    editable: [{ kind: 'copy', owner: 'config/response-security.json', box: EDITABLE }],
    declaredDependencies: {},
    excludedPrefixes: ['src/private/', 'node_modules/'],
    nodejs: { node: '>=24', pnpm: '10.34.5', typescript: '6.0.3', vitest: '5.0.1', typesNode: '24.13.6' },
    requires: [{ program: 'node' }],
    setup: [],
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

  it('rejects a non-portable cwd, an empty or blank program, an empty name and an out-of-range timeout', () => {
    const bad: Array<Record<string, unknown>> = [
      { ...check({}), program: '' },
      { ...check({}), program: '   ' },
      { ...check({}), cwd: '../outside' },
      { ...check({}), name: '' },
      { ...check({}), timeoutMs: 0 },
      { ...check({}), timeoutMs: 600_001 }
    ];
    for (const command of bad) {
      expect(() => parseAgreement(agreementWith({ commands: [command] }))).toThrowError(AgreementInvalid);
    }
  });

  it('accepts arbitrary program names and a distinct setup list that may be empty', () => {
    const agreement = parseAgreement(agreementWith({
      requires: [{ program: 'python', version: '>=3.12' }, { program: 'make' }],
      setup: [{ name: 'prepare', program: 'python', args: ['-m', 'venv', '.venv'], cwd: '.', context: 'owner', timeoutMs: 60_000 }],
      commands: [check({ name: 'a', program: 'python', args: ['-m', 'unittest'], role: 'outcome' })]
    }));
    expect(agreement.requires[0]).toEqual({ program: 'python', version: '>=3.12' });
    expect(agreement.setup[0]).toMatchObject({ name: 'prepare', program: 'python', context: 'owner' });
    expect(agreement.commands[0]?.program).toBe('python');
    const bare = parseAgreement(agreementWith({ requires: [], setup: [], commands: [check({})] }));
    expect(bare.setup).toEqual([]);
    expect(bare.requires).toEqual([]);
  });

  it('rejects the removed old-format fields instead of parsing them', () => {
    expect(() => parseAgreement(agreementWith({
      commands: [{ ...check({}), tool: 'node' }]
    }))).toThrowError(AgreementInvalid);
    expect(() => parseAgreement(agreementWith({
      toolchain: { node: '>=24', pnpm: '10.34.5', typescript: '6.0.3', vitest: '5.0.1', typesNode: '24.13.6' },
      commands: [check({})]
    }))).toThrowError(AgreementInvalid);
  });
});

describe('declared command checks: runner', () => {
  it('records exit, role, context, log tail and seconds verbatim (no shell)', () => {
    const record = runDeclaredCheck(check({ name: 'echo-probe', args: ['-e', 'console.log("left $SHELL `id`"); process.exit(3)'] }), process.cwd());
    expect(record.result).toBe('fail');
    expect(record.exit).toBe(3);
    expect(record.role).toBe('guard');
    expect(record.log).toContain('left $SHELL `id`');
    expect(record.seconds).toBeGreaterThanOrEqual(0);
    expect(record.command).toMatch(/node(\.exe)?$/i);
  });

  it('runs an arbitrary native program with literal arguments, metacharacters intact', () => {
    const root = runRoot('argv');
    const argvDump = join(root, 'argv.json');
    const hostile = ['plain', 'a & echo pwned > pwned.txt', 'pipe | tee x', 'semi;colon', 'star*glob?', '$HOME', '`id`', '%PATH%', 'it is "quoted"'];
    const record = runDeclaredCheck(check({
      name: 'argv-probe',
      args: ['-e', `require('fs').writeFileSync(${JSON.stringify(argvDump)}, JSON.stringify(process.argv.slice(1)))`, ...hostile]
    }), root);
    expect(record.result, record.log).toBe('pass');
    expect(JSON.parse(readFileSync(argvDump, 'utf8'))).toEqual(hostile);
    expect(existsSync(join(root, 'pwned.txt'))).toBe(false);
  });

  it('runs a non-JavaScript program declared by bare name', () => {
    const record = runDeclaredCheck(check({ name: 'native', program: 'git', args: ['--version'] }), process.cwd());
    expect(record.result, record.log).toBe('pass');
    expect(record.log).toContain('git version');
  });

  it('runs in a declared subdirectory and refuses a link that escapes the root', () => {
    const root = runRoot('ctx');
    mkdirSync(join(root, 'sub'), { recursive: true });
    const record = runDeclaredCheck(check({ cwd: 'sub' }), root);
    expect(record.result).toBe('pass');
    expect(record.cwd).toBe('sub');

    const outside = runRoot('outside');
    symlinkSync(outside, join(root, 'link'), 'junction');
    expect(() => runDeclaredCheck(check({ cwd: 'link' }), root)).toThrowError(CheckOutsideRoot);
  });

  it('names a timeout, never a pass', () => {
    const record = runDeclaredCheck(check({ args: ['-e', 'setTimeout(() => {}, 5000)'], timeoutMs: 500 }), process.cwd());
    expect(record.result).not.toBe('pass');
    expect(['timeout', 'error']).toContain(record.result);
  });

  it('names a missing program as an error record, never a pass', () => {
    const record = runDeclaredCheck(check({ name: 'ghost', program: 'box-a1-no-such-program-xyz' }), process.cwd());
    expect(record.result).toBe('error');
    expect(record.exit).toBeNull();
    expect(record.log).toContain('box-a1-no-such-program-xyz');
  });
});

describe('declared command checks: the Windows command-file launch rule', () => {
  function npmStyleShim(dir: string, name: string): { shim: string; target: string } {
    const target = join(dir, `${name}-tool.mjs`);
    const shim = join(dir, `${name}.cmd`);
    writeFileSync(target, `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const argv = process.argv.slice(2);
writeFileSync(join(${JSON.stringify(dir)}, '${name}-argv.json'), JSON.stringify(argv));
if (argv[0] === '--exit') process.exit(Number(argv[1]));
`);
    writeFileSync(shim, `@echo off\r\n"${process.execPath}" "%~dp0${name}-tool.mjs" %*\r\n`);
    return { shim, target };
  }

  it('starts a .cmd shim from a PATH name — execution, not just resolution', () => {
    const dir = runRoot('shim');
    const { shim } = npmStyleShim(dir, 'fakepm');
    const previousPath = process.env.PATH;
    process.env.PATH = `${dir};${previousPath}`;
    try {
      const record = runDeclaredCheck(check({ name: 'shim', program: 'fakepm', args: ['arg1', 'two words'] }), dir);
      expect(record.result, record.log).toBe('pass');
      expect(record.command).toBe(shim);
      expect(JSON.parse(readFileSync(join(dir, 'fakepm-argv.json'), 'utf8'))).toEqual(['arg1', 'two words']);
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it('carries metacharacter arguments through a command file verbatim', () => {
    const dir = runRoot('shim-meta');
    npmStyleShim(dir, 'probe');
    const hostile = ['a & echo pwned > pwned.txt', 'b | tee x', 'c; d', 'star*', 'care^t', '(paren)', '<tag>', 'src\\lib'];
    const record = runDeclaredCheck(check({ name: 'meta', program: join(dir, 'probe.cmd'), args: hostile }), dir);
    expect(record.result, record.log).toBe('pass');
    expect(JSON.parse(readFileSync(join(dir, 'probe-argv.json'), 'utf8'))).toEqual(hostile);
    expect(existsSync(join(dir, 'pwned.txt'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'pwned.txt'))).toBe(false);
  });

  it('keeps the shim exit code and refuses arguments a command line cannot carry', () => {
    const dir = runRoot('shim-exit');
    npmStyleShim(dir, 'exiter');
    const red = runDeclaredCheck(check({ name: 'red', program: join(dir, 'exiter.cmd'), args: ['--exit', '7'] }), dir);
    expect(red.result).toBe('fail');
    expect(red.exit).toBe(7);
    for (const arg of ['a "quoted" b', 'has %PERCENT%', 'bang!char']) {
      const record = runDeclaredCheck(check({ name: 'unsafe', program: join(dir, 'exiter.cmd'), args: [arg] }), dir);
      expect(record.result, arg).toBe('error');
      expect(record.exit, arg).toBeNull();
      expect(record.log, arg).toMatch(/cannot be carried/i);
    }
    expect(JSON.parse(readFileSync(join(dir, 'exiter-argv.json'), 'utf8'))).toEqual(['--exit', '7']);
  });

  it('refuses an argument ending in a backslash rather than corrupting the argv that reaches the shim', () => {
    const dir = runRoot('shim-backslash');
    npmStyleShim(dir, 'carrier');
    const record = runDeclaredCheck(check({ name: 'trailing', program: join(dir, 'carrier.cmd'), args: ['trail\\', 'second arg', 'a & b'] }), dir);
    expect(record.result).toBe('error');
    expect(record.exit).toBeNull();
    expect(record.log).toMatch(/trailing backslash/);
    expect(existsSync(join(dir, 'carrier-argv.json'))).toBe(false);
  });
});

describe('declared command checks: spelled-out program paths', () => {
  it('resolves a relative program path against the context root, not the host cwd', () => {
    const dir = runRoot('relprog');
    mkdirSync(join(dir, 'tools'));
    writeFileSync(join(dir, 'tools', 'probe.cmd'), '@echo off\r\necho %*> "%CD%\\rel-argv.json"\r\n');
    const record = runDeclaredCheck(check({ name: 'rel', program: 'tools/probe.cmd', args: ['ok'] }), dir);
    expect(record.result, record.log).toBe('pass');
    expect(record.command).toBe(join(dir, 'tools', 'probe.cmd'));
    expect(readFileSync(join(dir, 'rel-argv.json'), 'utf8')).toContain('ok');
  });

  it('refuses a spelled-out relative program that resolves outside the context root', () => {
    const dir = runRoot('relprog-inside');
    const outside = runRoot('relprog-out');
    writeFileSync(join(outside, 'tool.cmd'), '@echo off\r\necho ran> "%CD%\\escape-ran.txt"\r\n');
    const record = runDeclaredCheck(check({ name: 'esc', program: `../${basename(outside)}/tool.cmd`, args: [] }), dir);
    expect(record.result).toBe('error');
    expect(record.exit).toBeNull();
    expect(record.log).toMatch(/outside the context root/);
    expect(existsSync(join(dir, 'escape-ran.txt'))).toBe(false);
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
    expect(manifest.warnings).toEqual([expect.stringMatching(/legacy 'checks'/), expect.stringMatching(/recipient-context checks/)]);
    expect(manifest.commands[0]?.program).toBe('node');

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
    expect(manifest.warnings).toEqual([expect.stringMatching(/legacy 'checks'/), expect.stringMatching(/recipient-context checks/)]);
    expect(manifest.evaluator).toHaveLength(1);
  });

  it('refuses to export when a declared guard is red on the untouched base', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.commands = [check({ name: 'red-guard', args: ['-e', 'process.exit(7)'] })]; }
    });
    expect(() => runExport(agreement)).toThrowError(ExportFailed);
  });

  it('runs declared setup before checks and records it on the base', () => {
    const marker = join('scratch-a1-setup', 'prepared.txt').split('\\').join('/');
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.setup = [{
          name: 'prepare', program: 'node',
          args: ['-e', `require('fs').mkdirSync('scratch-a1-setup',{recursive:true});require('fs').writeFileSync('scratch-a1-setup/prepared.txt','yes')`],
          cwd: '.', context: 'owner', timeoutMs: 30_000
        }];
        value.commands = [
          check({ name: 'sees-setup', args: ['-e', `process.exit(require('fs').existsSync('${marker}')?0:1)`] }),
          check({ name: 'base-outcome', role: 'outcome', args: ['-e', 'process.exit(1)'] })
        ];
      }
    });
    const manifest = BoxManifestSchema.parse(JSON.parse(readFileSync(join(runExport(agreement).outDir, 'box.json'), 'utf8')));
    expect(manifest.baseChecks.map(record => `${record.role}:${record.name}:${record.result}`)).toEqual([
      'setup:prepare:pass', 'guard:sees-setup:pass', 'outcome:base-outcome:fail'
    ]);
  });

  it('fails the export, naming the setup command, when a declared setup command does not exit 0', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.setup = [{ name: 'broken-install', program: 'node', args: ['-e', 'process.exit(9)'], cwd: '.', context: 'owner', timeoutMs: 30_000 }];
        value.commands = [check({ name: 'never-runs' })];
      }
    });
    expect(() => runExport(agreement)).toThrowError(/setup command 'broken-install'/);
  });

  it('names a missing declared program before any setup side effect runs', () => {
    const outDir = join(runRoot('preflight'), 'box');
    const sideEffect = join(runRoot('preflight-side-effect'), 'wrote.txt');
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.setup = [{
          name: 'would-write', program: 'node',
          args: ['-e', `require('fs').writeFileSync(${JSON.stringify(sideEffect)},'x')`],
          cwd: '.', context: 'owner', timeoutMs: 30_000
        }];
        value.commands = [check({ name: 'ghost-check', program: 'box-a1-no-such-program-xyz' })];
      }
    });
    expect(() => runExport(agreement, undefined, outDir)).toThrowError(/box-a1-no-such-program-xyz/);
    expect(existsSync(outDir)).toBe(false);
    expect(existsSync(sideEffect)).toBe(false);
  });

  it.each([
    { label: 'recipient check program', missing: 'box-a1-no-such-recipient-xyz', place: (value: any, command: unknown) => { value.commands = [command]; } },
    { label: 'recipient relative check program', missing: 'tools/no-such-probe.cmd', place: (value: any, command: unknown) => { value.commands = [command]; } },
    { label: 'recipient setup program', missing: 'box-a1-no-such-recipient-setup-xyz', place: (value: any) => {
      value.setup = [{ name: 'ghost', program: 'box-a1-no-such-recipient-setup-xyz', args: ['-e', 'process.exit(0)'], cwd: '.', context: 'recipient', timeoutMs: 30_000 }];
      value.commands = [check({ name: 'guard' })];
    } },
    { label: 'solver prerequisite', missing: 'box-a1-no-such-requires-xyz', place: (value: any) => { value.requires = [{ program: 'box-a1-no-such-requires-xyz' }]; value.commands = [check({ name: 'guard' })]; } }
  ])('names a missing $label before any owner setup side effect runs', ({ missing, place }) => {
    const outDir = join(runRoot('preflight-order'), 'box');
    const sideEffect = join(runRoot('preflight-order-side-effect'), 'wrote.txt');
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.setup = [{
          name: 'would-write', program: 'node',
          args: ['-e', `require('fs').writeFileSync(${JSON.stringify(sideEffect)},'x')`],
          cwd: '.', context: 'owner', timeoutMs: 30_000
        }];
        place(value, check({ name: 'ghost', program: missing, context: 'recipient' }));
      }
    });
    expect(() => runExport(agreement, undefined, outDir)).toThrowError(/no-such/);
    expect(existsSync(outDir)).toBe(false);
    expect(existsSync(sideEffect)).toBe(false);
  });

  it('names a missing solver prerequisite from requires', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.requires = [{ program: 'node' }, { program: 'box-a1-no-such-tool-xyz', version: '>=1' }];
        value.commands = [check({ name: 'guard' })];
      }
    });
    expect(() => runExport(agreement)).toThrowError(/box-a1-no-such-tool-xyz/);
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
