import { byteHash, canonicalize, contentHash } from '../contracts/hash.js';
import { ExternalTaskContractSchema } from '../contracts/public/task.js';
import { PolicySpecificationSchema } from '../contracts/public/response-policy.js';
import { assertDistinctPaths, PortablePathSchema } from '../contracts/paths.js';
import { PUBLIC_DEPENDENCIES, PUBLIC_FILES, PUBLIC_TEMPLATE_ID, PUBLIC_TEMPLATE_VERSION } from '../../templates/workspaces/catalogue.js';

const STUBS = {
  client_wiring: `export default async function selectOption(_selectedId: string): Promise<string> { throw new Error('Implementation needed'); }\n`,
  frontend_component: `import type { TaskProps } from 'TYPES';\nexport default function TaskComponent(_props: TaskProps) { return <div role="status">Implementation needed</div>; }\n`,
  backend_api: `import type { PublicContext, ApiResult } from 'TYPES';\nexport default async function handleSelection(_body: unknown, _context: PublicContext): Promise<ApiResult> { return { status: 501, body: { code: 'not_implemented' } }; }\n`,
  backend_pure_module: `import { InvalidInput } from 'TYPES';\nimport type { RankItem } from 'TYPES';\nexport { InvalidInput };\nexport default function rankItems(_items: readonly RankItem[]): RankItem[] { throw new InvalidInput('Implementation needed'); }\n`
};
export const PUBLIC_TEMPLATE_HASH = contentHash({ schemaVersion: 1, id: PUBLIC_TEMPLATE_ID, version: PUBLIC_TEMPLATE_VERSION, dependencies: PUBLIC_DEPENDENCIES, files: PUBLIC_FILES, stubs: STUBS });
const asciiSort = (a: { path: string }, b: { path: string }) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
function plain(input: unknown) { return JSON.parse(canonicalize(input)) as unknown; }
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_workspace_proposal');
  return input as Record<string, unknown>;
}
export function preparePublicWorkspace(input: unknown, configuration: unknown) {
  try {
    const contract = ExternalTaskContractSchema.parse(plain(input));
    const options = record(plain(configuration));
    if (Object.keys(options).some(key => !['imageDigest', 'policySpecification'].includes(key)) || typeof options.imageDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(options.imageDigest)) throw new Error('invalid_workspace_proposal');
    if (new Set(contract.workUnits.map(unit => unit.adapterKind)).size !== contract.workUnits.length) throw new Error('unsupported_workspace_shape');
    const frontendUnit = contract.workUnits.find(unit => unit.adapterKind === 'frontend_component');
    const hasApi = contract.workUnits.some(unit => unit.adapterKind === 'backend_api');
    let clientPath: string | null = null;
    if (frontendUnit && hasApi) {
      const declared = frontendUnit.editablePaths.filter(path => path.endsWith('.ts'));
      if (declared.length > 1) throw new Error('unsupported_client_wiring');
      const component = frontendUnit.editablePaths.find(path => path.endsWith('.tsx'));
      if (!component) throw new Error('unsupported_frontend_shape');
      clientPath = declared[0] ?? component.slice(0, component.lastIndexOf('/') + 1) + 'selection-client.ts';
      if (!declared.length) { if (contract.editablePaths.includes(clientPath)) throw new Error('client_path_collision'); frontendUnit.editablePaths.push(clientPath); contract.editablePaths.push(clientPath); }
    }
    const files: Record<string, string> = { ...PUBLIC_FILES };
    const destinations = new Set<string>();
    for (const unit of contract.workUnits) {
      for (const path of unit.editablePaths) {
        PortablePathSchema.parse(path);
        if (Object.hasOwn(files, path) || path.startsWith('tooling/') || path.startsWith('interfaces/') || path.startsWith('fixtures/') || path === 'workspace.json' || destinations.has(path)) throw new Error('invalid_workspace_proposal');
        destinations.add(path);
      }
      if (unit.adapterKind === 'application_policy') {
        if (unit.editablePaths.length !== 1 || unit.editablePaths[0] !== 'config/response-security.json') throw new Error('unsupported_policy_path');
        const specification = PolicySpecificationSchema.parse(options.policySpecification);
        files[unit.editablePaths[0]!] = canonicalize(specification.allowedPolicies[0]);
        files['fixtures/policy-obligations.json'] = canonicalize(specification);
      } else {
        const extension = unit.adapterKind === 'frontend_component' ? '.tsx' : '.ts';
        const sources = unit.editablePaths.filter(path => path.endsWith(extension));
        if (sources.length !== 1 || unit.editablePaths.some(path => path !== sources[0] && !(unit.adapterKind === 'frontend_component' && (path.endsWith('.css') || path === clientPath)))) throw new Error('unsupported_edit_responsibility');
        const path = sources[0]!;
        const typesImport = ('../'.repeat(path.split('/').length - 1) || './') + 'interfaces/types.js';
        files[path] = STUBS[unit.adapterKind].replace('TYPES', typesImport).replace('TYPES', typesImport);
        for (const style of unit.editablePaths.filter(path => path.endsWith('.css'))) files[style] = '';
        if (unit.adapterKind === 'frontend_component' && clientPath) files[clientPath] = STUBS.client_wiring;
      }
    }
    for (const item of contract.interfaces) {
      if (Object.hasOwn(files, item.schema.path) || destinations.has(item.schema.path)) throw new Error('interface_tooling_collision');
      const participants = [...item.producerUnitIds, ...item.consumerUnitIds].map(id => contract.workUnits.find(unit => unit.id === id)!.adapterKind);
      const policy = participants.includes('application_policy');
      if (item.semantics !== (policy ? 'file' : 'request_response')) throw new Error('unsupported_interface_semantics');
      const schema = policy
        ? { schemaVersion: 1, id: item.schema.id, version: item.schema.version, mediaType: 'application/json', policy: JSON.parse(files['fixtures/policy-obligations.json']!) }
        : { schemaVersion: 1, id: item.schema.id, version: item.schema.version, request: { type: 'object', required: ['selectedId'], additionalProperties: false, properties: { selectedId: { type: 'string', maxLength: 64 } } }, trustedContext: 'Generic option context is supplied only by the trusted wrapper, never the browser.', response: { selectedId: 'string', errorCodes: ['invalid_input','not_found','unavailable'] } };
      files[item.schema.path] = canonicalize(schema);
      item.schema.sha256 = byteHash(Buffer.from(files[item.schema.path]!, 'utf8'));
    }
    const frontend = contract.workUnits.find(unit => unit.adapterKind === 'frontend_component');
    if (frontend) {
      const source = frontend.editablePaths.find(path => path.endsWith('.tsx'))!;
      files['index.html'] = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Approved public task</title></head><body><div id="root"></div><script type="module" src="/tooling/client.tsx"></script></body></html>';
      files['tooling/client.tsx'] = `import { useState } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport Component from '../${source}';\n${clientPath ? `import selectOption from '../${clientPath}';` : ''}\nimport fixture from '../fixtures/options.json';\n${frontend.editablePaths.filter(path => path.endsWith('.css')).map(path => `import '../${path}';`).join('\n')}\nfunction App() { const [selectedId, setSelectedId] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); return <Component options={fixture.options} selectedId={selectedId} loading={false} error={error} locale={fixture.locale} currency={fixture.currency} onSelect={async id => { ${contract.workUnits.some(unit => unit.adapterKind === 'backend_api') ? "try { setSelectedId(await selectOption(id)); setError(null); } catch { setError('Selection unavailable'); }" : 'setSelectedId(id); setError(null);'} }} />; }\ncreateRoot(document.getElementById('root')!).render(<App />);\n`;
    }
    const workspace = { schemaVersion: 1, templateId: PUBLIC_TEMPLATE_ID, templateVersion: PUBLIC_TEMPLATE_VERSION, workUnits: contract.workUnits, interfaces: contract.interfaces, endToEndRequirementIds: contract.endToEndRequirements.map(requirement => requirement.id), authoritativeAcceptance: false, requiredRunner: 'dedicated-linux-kvm-fresh-vm' };
    files['workspace.json'] = canonicalize(workspace);
    contract.dependencies = Object.entries(PUBLIC_DEPENDENCIES).map(([name, version]) => ({ name, version }));
    contract.template = { id: PUBLIC_TEMPLATE_ID, version: PUBLIC_TEMPLATE_VERSION, sha256: PUBLIC_TEMPLATE_HASH };
    contract.imageDigest = options.imageDigest;
    const checked = ExternalTaskContractSchema.parse(contract);
    const assets = Object.entries(files).map(([path, text]) => ({ path, contentBase64: Buffer.from(text, 'utf8').toString('base64'), mediaType: path.endsWith('.json') ? 'application/json' as const : path.endsWith('.css') ? 'text/css' as const : path.endsWith('.html') ? 'text/html' as const : path.endsWith('.txt') ? 'text/plain' as const : 'application/typescript' as const }));
    assertDistinctPaths(assets.map(asset => asset.path));
    return { assurance: 'bounded' as const, approvalRequired: true as const, runtimeReadiness: 'unverified' as const, contract: checked, contractHash: contentHash(checked), assets: assets.sort(asciiSort) };
  } catch { throw new Error('invalid_workspace_proposal'); }
}
export function verifyVettedWorkspace(input: unknown, rawAssets: unknown) {
  try {
    const contract = ExternalTaskContractSchema.parse(plain(input));
    if (contract.template.id !== PUBLIC_TEMPLATE_ID || contract.template.version !== PUBLIC_TEMPLATE_VERSION || contract.template.sha256 !== PUBLIC_TEMPLATE_HASH || !Array.isArray(rawAssets)) throw new Error('invalid_vetted_workspace');
    const assets = rawAssets.map(value => {
      const asset = record(plain(value));
      if (Object.keys(asset).some(key => !['path', 'contentBase64', 'mediaType', 'sourceAssetId'].includes(key)) || typeof asset.path !== 'string' || typeof asset.contentBase64 !== 'string') throw new Error('invalid_vetted_workspace');
      return { path: asset.path, contentBase64: asset.contentBase64 };
    });
    assertDistinctPaths(assets.map(asset => asset.path));
    const policySource = assets.find(asset => asset.path === 'fixtures/policy-obligations.json');
    const options = { imageDigest: contract.imageDigest, ...(policySource ? { policySpecification: JSON.parse(Buffer.from(policySource.contentBase64, 'base64').toString('utf8')) as unknown } : {}) };
    const expected = preparePublicWorkspace(contract, options);
    if (contentHash(expected.contract) !== contentHash(contract)) throw new Error('invalid_vetted_workspace');
    const editable = new Set(contract.editablePaths);
    const found = new Map(assets.map(asset => [asset.path, asset.contentBase64]));
    if (found.size !== expected.assets.length || expected.assets.some(asset => !found.has(asset.path) || !editable.has(asset.path) && found.get(asset.path) !== asset.contentBase64)) throw new Error('invalid_vetted_workspace');
    return { assurance: 'bounded' as const, status: 'checked' as const, runtimeReadiness: 'unverified' as const };
  } catch { return { assurance: 'bounded' as const, status: 'rejected' as const, runtimeReadiness: 'unverified' as const }; }
}
