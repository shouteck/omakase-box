import { expect, it } from 'vitest';
import { proposeBoundaryExtraction } from '../../../packages/analyzer/adapters/extraction.js';
import type { BoundaryExtractionProposal } from '../../../packages/analyzer/adapters/extraction.js';
import { digest, expectNotSupported, fixtureRequest, patchFixture } from './fixtures.js';

function expectProposed(result: Awaited<ReturnType<typeof proposeBoundaryExtraction>>): BoundaryExtractionProposal {
  if (result.status !== 'proposed') throw new Error(`expected a proposed extraction, received not_supported: ${result.reason}`);
  return result;
}

async function proposedFixture(): Promise<BoundaryExtractionProposal> {
  const result = await proposeBoundaryExtraction(fixtureRequest());
  return expectProposed(result);
}

it('a coupled selection flow acquires a newly typed generic boundary without layer splitting', async () => {
  const proposal = await proposedFixture();
  expect(proposal.status).toBe('proposed');
  expect(proposal.assurance).toBe('bounded');
  expect(proposal.extractedShape.kind).toBe('array-of-object');
  expect(proposal.extractedShape.elementProperties).toEqual([
    { name: 'id', type: 'string' },
    { name: 'displayName', type: 'string' },
    { name: 'monthlyPriceCents', type: 'number' },
    { name: 'available', type: 'boolean' },
    { name: 'disabledReason', type: 'string' }
  ]);
  expect(proposal.boundary.typeName).toBe('PublicOptions');
  expect(proposal.boundary.path).toBe('src/selection/public-options.ts');
  expect(proposal.boundary.generatedSource).toContain('export interface PublicOptions {');
  expect(proposal.parameterizedModules).toHaveLength(2);
  expect(proposal.parameterizedModules.map(entry => entry.path).sort()).toEqual(['src/selection/api.ts', 'src/selection/panel.tsx']);
  expect(proposal.privateCallerReplacements.map(entry => entry.path).sort()).toEqual(['src/app.tsx', 'src/server.ts']);
  expect(proposal.retainedAdapter.path).toBe('src/private/selection-adapter.ts');
  expect(proposal.checks).toEqual({ baselineTypes: 'passed', transformedTypes: 'passed', transformationModel: 'passed', modelAssertions: expect.arrayContaining([
    expect.stringContaining('public boundary exposes exactly'),
    expect.stringContaining('parameterized modules import only'),
    expect.stringContaining('retained adapter keeps'),
    expect.stringContaining('declared private callers supply')
  ]) });
  expect(Object.keys(proposal)).not.toContain('apply');
  expect(Object.keys(proposal)).not.toContain('execute');
  expect(proposal.approval).toEqual({ required: true, status: 'pending_owner_approval', proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
});

it('the proposed parameterization removes protected coupling from both layers while the retained adapter keeps the protected computation', async () => {
  const proposal = await proposedFixture();
  const api = proposal.parameterizedModules.find(entry => entry.path === 'src/selection/api.ts')!;
  expect(api.generatedSource).toContain('selectPlan(body: unknown, options: readonly PublicOptions[])');
  expect(api.generatedSource).not.toContain('derivePrivateOptions');
  expect(api.generatedSource).not.toContain('SyntheticSubject');
  expect(api.generatedSource).not.toContain('../private/rules.js');
  expect(api.generatedSource).toContain('./public-options.js');
  const panel = proposal.parameterizedModules.find(entry => entry.path === 'src/selection/panel.tsx')!;
  expect(panel.generatedSource).toContain('{ options }');
  expect(panel.generatedSource).toContain('readonly PublicOptions[]');
  expect(panel.generatedSource).not.toContain('subject');
  expect(panel.generatedSource).not.toContain('derivePrivateOptions');
  const server = proposal.privateCallerReplacements.find(entry => entry.path === 'src/server.ts')!;
  expect(server.generatedSource).toContain('providePublicOptions');
  expect(server.generatedSource).toContain("./private/selection-adapter.js");
  expect(server.generatedSource).toContain("{ id: 'synthetic-subject', tier: 'basic', region: 'north' }");
  const app = proposal.privateCallerReplacements.find(entry => entry.path === 'src/app.tsx')!;
  expect(app.generatedSource).toContain('options={providePublicOptions');
  const adapter = proposal.retainedAdapter;
  expect(adapter.generatedSource).toContain("import { derivePrivateOptions } from './rules.js';");
  expect(adapter.generatedSource).toContain(`import type { SyntheticSubject } from './rules.js';`);
  expect(adapter.generatedSource).toContain('import type { PublicOptions } from');
  expect(adapter.generatedSource).toContain('export function providePublicOptions(subject: SyntheticSubject): PublicOptions[]');
  expect(adapter.generatedSource).toContain('return derivePrivateOptions(subject);');
  expect(proposal.retainedPrivateWork.join(' ')).toContain('selection-adapter.ts');
});

it('the public projection carries the generic boundary only and never captured payloads, private paths or the adapter body', async () => {
  const proposal = await proposedFixture();
  const projection = {
    status: proposal.status,
    assurance: proposal.assurance,
    proposalHash: proposal.approval.proposalHash,
    boundary: proposal.boundary,
    extractedShape: proposal.extractedShape,
    checks: { baselineTypes: proposal.checks.baselineTypes, transformedTypes: proposal.checks.transformedTypes, transformationModel: proposal.checks.transformationModel },
    approval: { required: true, status: proposal.approval.status }
  };
  const serialized = JSON.stringify(projection);
  expect(serialized).not.toContain('SYNTHETIC_EXTRACTION_CANARY_MARK_A11');
  expect(serialized).not.toContain('derivePrivateOptions');
  expect(serialized).not.toContain('SyntheticSubject');
  expect(serialized).not.toContain('src/private');
  expect(serialized).not.toContain('selection-adapter');
  expect(serialized).toContain('"typeName":"PublicOptions"');
  expect(proposal.approval.proposalHash).toMatch(/^[a-f0-9]{64}$/);
});

it('lists uncaptured private couplings as advisory instead of silently ignoring them', async () => {
  const proposal = await proposedFixture();
  expect(proposal.advisoryUncapturedCandidates).toEqual(['src/other/lazy.ts']);
});

it('never executes or writes captured code into the workspace', async () => {
  const proposal = await proposedFixture();
  expect(proposal.status).toBe('proposed');
});

it('refuses a protected disclosure that is not an array-shaped consumer surface', async () => {
  const protectedModule = `export interface SyntheticSubject { id: string }\nexport function derivePrivateOptions(subject: SyntheticSubject): string {\n  return subject.id;\n}\n`;
  const consumer = `import { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nexport function useOptions(subject: SyntheticSubject) {\n  const options = derivePrivateOptions(subject);\n  return options;\n}\n`;
  const files = [
    { path: 'src/private/rules.ts', content: protectedModule, sha256: digest(protectedModule) },
    { path: 'src/selection/consumer.ts', content: consumer, sha256: digest(consumer) }
  ];
  await expectNotSupported(fixtureRequest({ files, coupledModulePaths: ['src/selection/consumer.ts'], privateCallerPaths: [] }), 'array-shaped consumer surface');
});

it('refuses option fields outside the bounded primitive disclosure', async () => {
  const protectedModule = `export interface SyntheticSubject { id: string; tier: 'basic' | 'verified' }\nexport function derivePrivateOptions(subject: SyntheticSubject) {\n  return [{ id: subject.id, amount: subject.tier === 'basic' ? 1 : 'many' }];\n}\n`;
  const consumer = `import { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nexport function useOptions(subject: SyntheticSubject) {\n  const options = derivePrivateOptions(subject);\n  return options;\n}\n`;
  const files = [
    { path: 'src/private/rules.ts', content: protectedModule, sha256: digest(protectedModule) },
    { path: 'src/selection/consumer.ts', content: consumer, sha256: digest(consumer) }
  ];
  await expectNotSupported(fixtureRequest({ files, coupledModulePaths: ['src/selection/consumer.ts'], privateCallerPaths: [] }), 'bounded string/number/boolean disclosure');
});

it('refuses calls outside a top-level exported consumer function', async () => {
  const files = fixtureRequest().files;
  const patched = files.map(file => file.path === 'src/selection/api.ts' ? { path: file.path, content: `import { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nexport function selectPlan(body: unknown, trustedSubject: SyntheticSubject) {\n  const wrapped = (() => {\n    const options = derivePrivateOptions(trustedSubject);\n    return options.length;\n  })();\n  return wrapped;\n}\n`, sha256: digest(`import { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nexport function selectPlan(body: unknown, trustedSubject: SyntheticSubject) {\n  const wrapped = (() => {\n    const options = derivePrivateOptions(trustedSubject);\n    return options.length;\n  })();\n  return wrapped;\n}\n`) } : file);
  await expectNotSupported(fixtureRequest({ files: patched }), 'not inside a named top-level exported function');
});

it('refuses a protected subject that is still used outside the removable binding', async () => {
  const files = fixtureRequest().files;
  const patched = files.map(file => file.path === 'src/selection/api.ts' ? { path: file.path, content: `import { z } from 'zod';\nimport { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nconst RequestSchema = z.strictObject({ selectedId: z.string() });\n\nexport function selectPlan(body: unknown, trustedSubject: SyntheticSubject) {\n  const parsed = RequestSchema.safeParse(body);\n  const options = derivePrivateOptions(trustedSubject);\n  const option = options.find(item => item.id === parsed.data.selectedId);\n  return { status: 200, body: { selectedId: option?.id ?? String(parsed.data.selectedId), owner: trustedSubject.id } } as const;\n}\n`, sha256: digest(`import { z } from 'zod';\nimport { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nconst RequestSchema = z.strictObject({ selectedId: z.string() });\n\nexport function selectPlan(body: unknown, trustedSubject: SyntheticSubject) {\n  const parsed = RequestSchema.safeParse(body);\n  const options = derivePrivateOptions(trustedSubject);\n  const option = options.find(item => item.id === parsed.data.selectedId);\n  return { status: 200, body: { selectedId: option?.id ?? String(parsed.data.selectedId), owner: trustedSubject.id } } as const;\n}\n`) } : file);
  await expectNotSupported(fixtureRequest({ files: patched }), 'still used outside the removable');
});

it('refuses residual protected-type references outside the parameterized annotations', async () => {
  const files = fixtureRequest().files;
  const patched = files.map(file => file.path === 'src/selection/api.ts' ? { path: file.path, content: `import { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nexport function selectPlan(body: unknown, trustedSubject: SyntheticSubject) {\n  const options = derivePrivateOptions(trustedSubject);\n  return options;\n}\n\nexport function rebind(subject: SyntheticSubject): string {\n  return subject.id;\n}\n`, sha256: digest(`import { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nexport function selectPlan(body: unknown, trustedSubject: SyntheticSubject) {\n  const options = derivePrivateOptions(trustedSubject);\n  return options;\n}\n\nexport function rebind(subject: SyntheticSubject): string {\n  return subject.id;\n}\n`) } : file);
  await expectNotSupported(fixtureRequest({ files: patched }), 'still references protected type');
});

it('refuses a caller that invokes an option-parameterized component directly as a function', async () => {
  const files = fixtureRequest().files;
  const patched = files.map(file => file.path === 'src/app.tsx' ? { path: file.path, content: `import { SelectionPanel } from './selection/panel.js';\n\nexport const App = () => <section>{String(SelectionPanel({ subject: { id: 'synthetic-subject', tier: 'basic', region: 'north' } }).props)}</section>;\n`, sha256: digest(`import { SelectionPanel } from './selection/panel.js';\n\nexport const App = () => <section>{String(SelectionPanel({ subject: { id: 'synthetic-subject', tier: 'basic', region: 'north' } }).props)}</section>;\n`) } : file);
  await expectNotSupported(fixtureRequest({ files: patched }), 'directly as a function');
});

it('refuses a broken pinned baseline instead of proposing over it', async () => {
  const files = fixtureRequest().files;
  const patched = files.map(file => file.path === 'src/server.ts' ? { path: file.path, content: `import { selectPlan } from './selection/api.js';\n\nexport function handle(body: unknown) {\n  return selectPlan(body);\n}\n`, sha256: digest(`import { selectPlan } from './selection/api.js';\n\nexport function handle(body: unknown) {\n  return selectPlan(body);\n}\n`) } : file);
  await expectNotSupported(fixtureRequest({ files: patched }), 'does not type-check cleanly');
});

it('records not_supported with explicit missing capabilities for a non-private retained adapter', async () => {
  const result = await proposeBoundaryExtraction(fixtureRequest({ retainedAdapterPath: 'src/public-adapter.ts' }));
  expect(result.status).toBe('not_supported');
  if (result.status !== 'not_supported') throw new Error('shape');
  expect(result.reason).toContain('private-managed path segment');
  expect(result.missingCapabilities.length).toBeGreaterThan(0);
});

it('rejects captured bytes that drift from the pinned digest', async () => {
  const request = fixtureRequest({ files: fixtureRequest().files.map(file => file.path === 'src/selection/api.ts' ? { path: file.path, content: `${file.content}\n// drift`, sha256: file.sha256 } : file) });
  const result = await proposeBoundaryExtraction(request);
  expect(result.status).toBe('not_supported');
  if (result.status !== 'not_supported') throw new Error('shape');
  expect(result.reason).toContain('drift from the pinned digest');
});
