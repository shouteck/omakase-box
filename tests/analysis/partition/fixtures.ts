import { createHash } from 'node:crypto';

export function digest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function patchFixture(files: readonly { path: string; content: string; sha256: string }[], path: string, content: string): { path: string; content: string; sha256: string }[] {
  return files.map(file => file.path === path ? { path, content, sha256: digest(content) } : file);
}

export const SYNTHETIC_EXTRACTION_CANARY = 'SYNTHETIC_EXTRACTION_CANARY_MARK_A11';

export const coupledFixtureFiles: readonly { path: string; content: string }[] = [
  { path: 'src/private/rules.ts', content: `export const PROTECTED_MARK = '${SYNTHETIC_EXTRACTION_CANARY}';\nexport interface SyntheticSubject { id: string; tier: 'basic' | 'verified'; region: 'north' | 'south' }\nexport function derivePrivateOptions(subject: SyntheticSubject) {\n  const regionalAdjustment = subject.region === 'north' ? 125 : 0;\n  return [\n    { id: 'basic', displayName: 'Basic', monthlyPriceCents: 2000 + regionalAdjustment, available: true, disabledReason: '' },\n    { id: 'pro', displayName: 'Pro', monthlyPriceCents: 4500 + regionalAdjustment, available: subject.tier === 'verified', disabledReason: subject.tier === 'verified' ? '' : 'Not available for this synthetic scenario.' }\n  ];\n}\n` },
  { path: 'src/selection/api.ts', content: `import { z } from 'zod';\nimport { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nconst RequestSchema = z.strictObject({ selectedId: z.string() });\n\nexport function selectPlan(body: unknown, trustedSubject: SyntheticSubject) {\n  const parsed = RequestSchema.safeParse(body);\n  if (!parsed.success) return { status: 400, body: { code: 'invalid_input' } } as const;\n  const options = derivePrivateOptions(trustedSubject);\n  const option = options.find(item => item.id === parsed.data.selectedId);\n  if (!option) return { status: 404, body: { code: 'not_found' } } as const;\n  return { status: 200, body: { selectedId: option.id } } as const;\n}\n` },
  { path: 'src/selection/panel.tsx', content: `import { useState } from 'react';\nimport { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nexport function SelectionPanel({ subject }: { subject: SyntheticSubject }) {\n  const options = derivePrivateOptions(subject);\n  const [selected, setSelected] = useState<string | null>(null);\n  const [status, setStatus] = useState('No plan selected.');\n  return <section><h1>Synthetic plan selection</h1>{options.map(option => <button key={option.id} aria-pressed={selected === option.id} onClick={() => { void option; setSelected(option.id); }}>{option.displayName}: {option.monthlyPriceCents}</button>)}<p role="status">{status}</p></section>;\n}\n` },
  { path: 'src/server.ts', content: `import { selectPlan } from './selection/api.js';\n\nexport function handle(body: unknown) {\n  return selectPlan(body, { id: 'synthetic-subject', tier: 'basic', region: 'north' });\n}\n` },
  { path: 'src/app.tsx', content: `import { SelectionPanel } from './selection/panel.js';\n\nexport const App = () => <SelectionPanel subject={{ id: 'synthetic-subject', tier: 'basic', region: 'north' }} />;\n` },
  { path: 'src/other/lazy.ts', content: `import { derivePrivateOptions } from '../private/rules.js';\nimport type { SyntheticSubject } from '../private/rules.js';\n\nexport function lazyOptions(subject: SyntheticSubject): number {\n  const options = derivePrivateOptions(subject);\n  return options.length;\n}\n` }
];

export interface ExtractionRequestish {
  readonly kind: 'private-boundary-extraction';
  readonly files: readonly { path: string; sha256: string; content: string }[];
  readonly protectedModulePath: string;
  readonly coupledModulePaths: readonly string[];
  readonly privateCallerPaths: readonly string[];
  readonly retainedAdapterPath: string;
  readonly boundaryName?: string;
}

export function fixtureRequest(overrides: Partial<ExtractionRequestish> = {}): ExtractionRequestish {
  const files = coupledFixtureFiles.map(file => ({ path: file.path, sha256: createHash('sha256').update(file.content, 'utf8').digest('hex'), content: file.content }));
  return {
    kind: 'private-boundary-extraction',
    files,
    protectedModulePath: 'src/private/rules.ts',
    coupledModulePaths: ['src/selection/api.ts', 'src/selection/panel.tsx'],
    privateCallerPaths: ['src/server.ts', 'src/app.tsx'],
    retainedAdapterPath: 'src/private/selection-adapter.ts',
    ...overrides
  };
}

export async function expectNotSupported(request: ExtractionRequestish, reasonSubstring: string): Promise<void> {
  const { proposer, expect } = await import('./helpers.js');
  const result = await proposer(request);
  expect(result.status).toBe('not_supported');
  if (result.status !== 'not_supported') throw new Error('shape');
  expect(result.reason).toContain(reasonSubstring);
  expect(result.missingCapabilities.length).toBeGreaterThan(0);
  expect(result.retainedPrivateWork.length).toBeGreaterThan(0);
  expect(result.proposalHash).toMatch(/^[a-f0-9]{64}$/);
}
