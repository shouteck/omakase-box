import { expect, it } from 'vitest';
import { preparePublicWorkspace, PUBLIC_TEMPLATE_HASH, verifyVettedWorkspace } from '../../../packages/compiler/workspace.js';
import { fullStackContract, singleUnitContract } from '../../contracts/fixtures.js';

const imageDigest = 'sha256:' + 'b'.repeat(64);
const policySpecification = { schemaVersion: 1, editablePath: 'config/response-security.json', allowedPolicies: [{ schemaVersion: 1, frameAncestors: 'none', noSniff: true, referrerPolicy: 'no-referrer', hsts: { enabled: true, maxAgeSeconds: 86400, includeSubDomains: false } }], excludedRoutes: ['/health'], ingressPolicy: 'trusted_https_non_localhost', overridePolicy: 'strip_candidate_controlled_headers' };
const text = (result: ReturnType<typeof preparePublicWorkspace>, path: string) => Buffer.from(result.assets.find(asset => asset.path === path)!.contentBase64, 'base64').toString('utf8');
it('assembles one shared offline workspace before approval and binds every fixed tooling/interface byte', () => {
  const input = fullStackContract(true);
  const prepared = preparePublicWorkspace(input, { imageDigest, policySpecification });
  expect(prepared.approvalRequired).toBe(true);
  expect(prepared.runtimeReadiness).toBe('unverified');
  expect(prepared.contract.workUnits.map(unit => unit.adapterKind)).toEqual(['frontend_component','backend_api','application_policy']);
  expect(prepared.contract.template).toMatchObject({ id: 'public_ts_workspace_v1', version: 1, sha256: PUBLIC_TEMPLATE_HASH });
  expect(prepared.contract.imageDigest).toBe(imageDigest);
  expect(input.template.sha256).not.toBe(PUBLIC_TEMPLATE_HASH);
  const pkg = JSON.parse(text(prepared, 'package.json'));
  expect(pkg.scripts).toEqual({ build: 'node tooling/build.mjs', start: 'node tooling/start.mjs', check: 'node tooling/check.mjs' });
  expect(pkg.dependencies.react).toBe('19.3.0');
  expect(text(prepared, 'INSTRUCTIONS.txt')).toContain('no network/lifecycle installation');
  expect(text(prepared, 'tooling/start.mjs')).not.toContain('X-Forwarded-Proto');
  expect(prepared.assets.filter(asset => asset.path === 'package.json')).toHaveLength(1);
  expect(verifyVettedWorkspace(prepared.contract, prepared.assets).status).toBe('checked');
});
it('full-stack ownership includes contributor-editable typed client wiring, not a silently pre-solved layer', () => {
  const prepared = preparePublicWorkspace(fullStackContract(true), { imageDigest, policySpecification });
  const frontend = prepared.contract.workUnits.find(unit => unit.adapterKind === 'frontend_component')!;
  const client = frontend.editablePaths.find(path => path.endsWith('.ts'));
  expect(client).toBeDefined();
  expect(prepared.contract.editablePaths).toContain(client);
  expect(text(prepared, client!)).toContain('Implementation needed');
  expect(text(prepared, 'tooling/client.tsx')).toContain(`import selectOption from '../${client}'`);
});
it('single-unit compatibility uses the same manifest/toolchain model', () => {
  const single = preparePublicWorkspace(singleUnitContract(), { imageDigest });
  expect(single.contract.workUnits).toHaveLength(1);
  expect(single.assets.some(asset => asset.path === 'src/PlanSelector.tsx')).toBe(true);
  expect(text(single, 'src/PlanSelector.tsx')).toContain('Implementation needed');
  expect(text(single, 'workspace.json')).not.toContain('privateRevision');
});
it('changes to a unit/interface invalidate the complete prepared content rather than splitting a layer bounty', () => {
  const a = preparePublicWorkspace(fullStackContract(true), { imageDigest, policySpecification });
  const contract = fullStackContract(true); contract.title = 'A changed combined outcome';
  const b = preparePublicWorkspace(contract, { imageDigest, policySpecification });
  expect(a.contractHash).not.toBe(b.contractHash);
  expect(a.contract.workUnits.length).toBe(b.contract.workUnits.length);
});
it('requires explicit policy choices and never invents a universal hardening requirement', () => {
  expect(() => preparePublicWorkspace(fullStackContract(true), { imageDigest })).toThrow('invalid_workspace_proposal');
  expect(() => preparePublicWorkspace(fullStackContract(true), { imageDigest, policySpecification: { ...policySpecification, command: 'evil' } })).toThrow('invalid_workspace_proposal');
});
it('does not normalize or silently omit an unsupported edit responsibility', () => {
  const contract = singleUnitContract(); contract.workUnits[0]!.editablePaths = ['src/Component.ts']; contract.editablePaths = ['src/Component.ts'];
  expect(() => preparePublicWorkspace(contract, { imageDigest })).toThrow('invalid_workspace_proposal');
});
it('rejects re-signed altered tooling, missing interface schemas and conflicting setup bytes', () => {
  const prepared = preparePublicWorkspace(fullStackContract(true), { imageDigest, policySpecification });
  const altered = structuredClone(prepared.assets); altered.find(asset => asset.path === 'tooling/build.mjs')!.contentBase64 = Buffer.from('process.exit(0)').toString('base64');
  expect(verifyVettedWorkspace(prepared.contract, altered).status).toBe('rejected');
  expect(verifyVettedWorkspace(prepared.contract, prepared.assets.filter(asset => asset.path !== prepared.contract.interfaces[0]!.schema.path)).status).toBe('rejected');
  expect(verifyVettedWorkspace(prepared.contract, [...prepared.assets, prepared.assets[0]!]).status).toBe('rejected');
});
it('remains general over safe declared module paths and does not expose retained adapters', () => {
  const contract = singleUnitContract(); contract.workUnits[0]!.editablePaths = ['src/components/Picker.tsx','src/components/Picker.css']; contract.editablePaths = ['src/components/Picker.tsx','src/components/Picker.css'];
  const prepared = preparePublicWorkspace(contract, { imageDigest });
  expect(prepared.assets.some(asset => asset.path === 'src/components/Picker.tsx')).toBe(true);
  expect(prepared.assets.every(asset => !asset.path.includes('private'))).toBe(true);
});
