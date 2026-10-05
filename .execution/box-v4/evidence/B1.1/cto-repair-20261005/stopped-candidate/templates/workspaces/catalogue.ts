export const PUBLIC_DEPENDENCIES = {
  '@playwright/test': '1.63.0', '@types/node': '24.13.6', '@types/react': '19.3.0', '@types/react-dom': '19.3.0',
  react: '19.3.0', 'react-dom': '19.3.0', typescript: '6.0.3', vite: '8.3.1', zod: '4.6.5'
} as const;
export const PUBLIC_TEMPLATE_ID = 'public_ts_workspace_v1';
export const PUBLIC_TEMPLATE_VERSION = 1;
export const PUBLIC_FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ name: 'approved-public-task', version: '1.0.0', private: true, type: 'module', engines: { node: '>=24.11.0 <25' }, scripts: { build: 'node tooling/build.mjs', start: 'node tooling/start.mjs', check: 'node tooling/check.mjs' }, dependencies: PUBLIC_DEPENDENCIES }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, jsx: 'react-jsx', skipLibCheck: true, noEmit: true, sourceMap: false }, include: ['src/**/*.ts', 'src/**/*.tsx', 'interfaces/**/*.ts'] }),
  'interfaces/types.ts': `export interface Option { id: string; displayName: string; monthlyPriceCents: number; available: boolean; disabledReason: string }
export interface TaskProps { options: readonly Option[]; selectedId: string | null; loading: boolean; error: string | null; locale: string; currency: string; onSelect(id: string): void }
export interface PublicContext { options: readonly Option[] }
export interface ApiResult { status: number; body: { selectedId?: string; code?: string }; headers?: Record<string,string> }
export interface RankItem { id: string; score: number }
export class InvalidInput extends Error { constructor(message = 'InvalidInput') { super(message); this.name = 'InvalidInput'; } }
`,
  'fixtures/options.json': JSON.stringify({ options: [{ id: 'basic', displayName: 'Basic', monthlyPriceCents: 1000, available: true, disabledReason: '' }, { id: 'plus', displayName: 'Plus', monthlyPriceCents: 2000, available: false, disabledReason: 'Unavailable in this example' }], locale: 'en-US', currency: 'USD' }),
  'tooling/policy.mjs': `export function parsePolicy(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 65536) throw new Error('invalid_policy');
  let at = 0;
  const space = () => { while (/[ \\t\\r\\n]/.test(source[at] ?? '\\u0000')) at++; };
  function string() { const start = at; if (source[at++] !== '"') throw new Error('invalid_policy'); while (at < source.length) { const char = source[at++]; if (char === '\\\\') { at++; continue; } if (char === '"') return JSON.parse(source.slice(start, at)); } throw new Error('invalid_policy'); }
  function value(depth) {
    if (depth > 8) throw new Error('invalid_policy'); space();
    if (source[at] === '"') return string();
    if (source[at] === '{') { at++; space(); const result = Object.create(null); if (source[at] === '}') { at++; return result; } while (at < source.length) { const key = string(); if (Object.hasOwn(result, key)) throw new Error('invalid_policy'); space(); if (source[at++] !== ':') throw new Error('invalid_policy'); result[key] = value(depth + 1); space(); const end = source[at++]; if (end === '}') return result; if (end !== ',') throw new Error('invalid_policy'); space(); } throw new Error('invalid_policy'); }
    for (const [literal, result] of [['true',true],['false',false]]) if (source.startsWith(literal, at)) { at += literal.length; return result; }
    const number = /^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?/.exec(source.slice(at)); if (!number) throw new Error('invalid_policy'); at += number[0].length; return Number(number[0]);
  }
  const policy = value(0); space();
  const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key));
  if (at !== source.length || !keys(policy,['schemaVersion','frameAncestors','noSniff','referrerPolicy','hsts']) || policy.schemaVersion !== 1 || !['none','self'].includes(policy.frameAncestors) || typeof policy.noSniff !== 'boolean' || !['no-referrer','same-origin','strict-origin-when-cross-origin'].includes(policy.referrerPolicy) || !keys(policy.hsts,['enabled','maxAgeSeconds','includeSubDomains']) || typeof policy.hsts.enabled !== 'boolean' || typeof policy.hsts.includeSubDomains !== 'boolean' || !Number.isInteger(policy.hsts.maxAgeSeconds) || policy.hsts.maxAgeSeconds < 0 || policy.hsts.maxAgeSeconds > 31536000) throw new Error('invalid_policy');
  return policy;
}
export function applyPolicy(headers, policy, ingress) {
  if (ingress.route === '/health') return { ...headers };
  const controlled = ['content-security-policy','x-content-type-options','referrer-policy','strict-transport-security'];
  const result = Object.fromEntries(Object.entries(headers).filter(([name]) => !controlled.includes(name.toLowerCase())));
  result['Content-Security-Policy'] = "frame-ancestors '" + policy.frameAncestors + "'"; result['Referrer-Policy'] = policy.referrerPolicy;
  if (policy.noSniff) result['X-Content-Type-Options'] = 'nosniff';
  if (policy.hsts.enabled && ingress.https && !ingress.localhost) result['Strict-Transport-Security'] = 'max-age=' + policy.hsts.maxAgeSeconds + (policy.hsts.includeSubDomains ? '; includeSubDomains' : '');
  return result;
}
`,
  'tooling/browser-check.mjs': `import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
export async function browserCheck(withApi) {
  const server = spawn(process.execPath, ['tooling/start.mjs'], { stdio: ['ignore','pipe','ignore'], env: { PATH: process.env.PATH ?? '' } });
  let browser;
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('public_server_unavailable')), 5000); let output = ''; server.stdout.on('data', chunk => { output += chunk; if (output.includes('public_workspace_ready')) { clearTimeout(timer); resolve(); } }); server.once('error', () => { clearTimeout(timer); reject(new Error('public_server_unavailable')); }); server.once('exit', () => { clearTimeout(timer); reject(new Error('public_server_unavailable')); }); });
    browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4173/');
    const basic = page.getByRole('button', { name: /Basic/ }).or(page.getByRole('radio', { name: /Basic/ })).or(page.getByRole('option', { name: /Basic/ }));
    const plus = page.getByRole('button', { name: /Plus/ }).or(page.getByRole('radio', { name: /Plus/ })).or(page.getByRole('option', { name: /Plus/ }));
    assert.equal(await basic.count(), 1); assert.equal(await plus.count(), 1); assert.equal(await plus.isDisabled(), true);
    const selectionResponse = withApi ? page.waitForResponse(response => response.url().endsWith('/selection') && response.request().method() === 'POST', { timeout: 5000 }) : null;
    if (await basic.evaluate(node => node.tagName) === 'OPTION') { const value = await basic.getAttribute('value'); if (!value) throw new Error('missing_option_id'); await page.getByRole('combobox').selectOption(value); }
    else { await basic.focus(); await page.keyboard.press('Space'); }
    if (withApi) {
      const browserResponse = await selectionResponse; assert.equal(browserResponse.status(), 200); assert.equal((await browserResponse.json()).selectedId, 'basic');
      const success = await page.request.post('http://127.0.0.1:4173/selection', { data: { selectedId: 'basic' } }); assert.equal(success.status(), 200); assert.equal((await success.json()).selectedId, 'basic');
      const forged = await page.request.post('http://127.0.0.1:4173/selection', { data: { selectedId: 'plus', context: { options: [{ id: 'plus', available: true }] } } }); assert.equal(forged.status(), 400);
      const rejected = await page.request.post('http://127.0.0.1:4173/selection', { data: { selectedId: 'plus' } }); assert.equal(rejected.status(), 422); assert.equal((await rejected.json()).code, 'unavailable');
    }
  } finally { if (browser) await browser.close(); server.kill(); }
}
`,
  'tooling/build.mjs': `import { readFile, mkdir, symlink, lstat } from 'node:fs/promises';
import { build } from 'vite';
const workspace = JSON.parse(await readFile('workspace.json', 'utf8'));
try { await lstat('node_modules'); } catch { await symlink('/opt/toolchain/node_modules', 'node_modules', 'dir'); }
await mkdir('.build', { recursive: true });
for (const unit of workspace.workUnits) {
  if (unit.adapterKind === 'application_policy') continue;
  if (unit.adapterKind === 'frontend_component') {
    await build({ configFile: false, root: '.', base: './', build: { outDir: '.build/ui', emptyOutDir: false, sourcemap: false, rollupOptions: { input: 'index.html' } } });
  } else {
    await build({ configFile: false, root: '.', build: { ssr: unit.editablePaths[0], outDir: '.build', emptyOutDir: false, sourcemap: false, rollupOptions: { output: { entryFileNames: unit.id + '.mjs' } } } });
  }
}
console.log(JSON.stringify({ assurance: 'tested', build: 'complete', authoritativeAcceptance: false }));
`,
  'tooling/worker.mjs': `import { pathToFileURL } from 'node:url';
let source = ''; for await (const chunk of process.stdin) { source += chunk; if (source.length > 65536) process.exit(2); }
const input = JSON.parse(source);
if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(input.unitId)) process.exit(2);
const module = await import(pathToFileURL(process.cwd() + '/.build/' + input.unitId + '.mjs').href);
const result = input.mode === 'api' ? await module.default(input.body, input.context) : await module.default(input.items);
process.stdout.write(JSON.stringify(result));
`,
  'tooling/call.mjs': `import { spawn } from 'node:child_process';
export function callCandidate(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tooling/worker.mjs'], { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH ?? '' } });
    let output = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('candidate_timeout')); }, 5000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 65536) { child.kill(); reject(new Error('candidate_output_limit')); } });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); try { if (code !== 0) throw new Error('candidate_failure'); resolve(JSON.parse(output)); } catch { reject(new Error('candidate_failure')); } });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(input));
  });
}
`,
  'tooling/start.mjs': `import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { callCandidate } from './call.mjs';
import { parsePolicy, applyPolicy } from './policy.mjs';
const workspace = JSON.parse(await readFile('workspace.json', 'utf8'));
const fixture = JSON.parse(await readFile('fixtures/options.json', 'utf8'));
const api = workspace.workUnits.find(unit => unit.adapterKind === 'backend_api');
const policyUnit = workspace.workUnits.find(unit => unit.adapterKind === 'application_policy');
const policy = policyUnit ? parsePolicy(await readFile(policyUnit.editablePaths[0], 'utf8')) : null;
const responseHeaders = (headers, route) => policy ? applyPolicy(headers, policy, { https: false, localhost: true, route }) : headers;
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/health' && request.method === 'GET') { response.writeHead(200, responseHeaders({ 'Content-Type': 'application/json' }, '/health')); response.end('{"status":"ok"}'); return; }
    if (request.url === '/selection' && request.method === 'POST' && api) {
      let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 1024) throw new Error('invalid_input'); }
      const input = JSON.parse(body);
      if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.selectedId !== 'string' || input.selectedId.length > 64) throw new Error('invalid_input');
      const result = await callCandidate({ mode: 'api', unitId: api.id, body: { selectedId: input.selectedId }, context: { options: fixture.options } });
      if (!result || !Number.isInteger(result.status) || result.status < 200 || result.status > 599 || typeof result.body !== 'object') throw new Error('invalid_result');
      response.writeHead(result.status, responseHeaders({ 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }, '/selection')); response.end(JSON.stringify(result.body)); return;
    }
    if (request.method !== 'GET' || !(request.url === '/' || /^\\/assets\\/[A-Za-z0-9_.-]+$/.test(request.url ?? ''))) { response.writeHead(404); response.end(); return; }
    const path = request.url === '/' ? 'index.html' : request.url.slice(1);
    const bytes = await readFile('.build/ui/' + path);
    response.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', 'X-Content-Type-Options': 'nosniff' }); response.end(bytes);
  } catch { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end('{"code":"invalid_input"}'); }
});
server.listen(4173, '0.0.0.0', () => console.log('public_workspace_ready'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close());
`,
  'tooling/check.mjs': `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { callCandidate } from './call.mjs';
import { parsePolicy, applyPolicy } from './policy.mjs';
import { browserCheck } from './browser-check.mjs';
const canonical = value => value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const workspace = JSON.parse(await readFile('workspace.json', 'utf8'));
const fixture = JSON.parse(await readFile('fixtures/options.json', 'utf8'));
const results = [];
for (const unit of workspace.workUnits) {
  try {
    if (unit.adapterKind === 'backend_pure_module') {
      const items = [{ id: 'b', score: 1 }, { id: 'a', score: 1 }, { id: 'c', score: 2 }];
      assert.deepEqual(await callCandidate({ mode: 'module', unitId: unit.id, items }), [items[2],items[1],items[0]]);
    } else if (unit.adapterKind === 'backend_api') {
      assert.deepEqual(await callCandidate({ mode: 'api', unitId: unit.id, body: { selectedId: 'basic' }, context: { options: fixture.options } }), { status: 200, body: { selectedId: 'basic' } });
      const rejected = await callCandidate({ mode: 'api', unitId: unit.id, body: { selectedId: 'plus' }, context: { options: fixture.options } }); assert.equal(rejected.status, 422); assert.equal(rejected.body.code, 'unavailable');
    } else if (unit.adapterKind === 'frontend_component') {
      await browserCheck(workspace.workUnits.some(item => item.adapterKind === 'backend_api'));
    } else if (unit.adapterKind === 'application_policy') {
      const policy = parsePolicy(await readFile(unit.editablePaths[0], 'utf8'));
      const obligations = JSON.parse(await readFile('fixtures/policy-obligations.json', 'utf8'));
      assert.equal(obligations.allowedPolicies.some(allowed => canonical(allowed) === canonical(policy)), true);
      const base = { 'Content-Type': 'application/json', 'content-security-policy': 'candidate override', 'strict-transport-security': 'candidate override' };
      const https = applyPolicy(base, policy, { https: true, localhost: false, route: '/selection' });
      assert.equal(https['Content-Security-Policy'], "frame-ancestors '" + policy.frameAncestors + "'");
      assert.equal(https['Referrer-Policy'], policy.referrerPolicy);
      assert.equal(Object.hasOwn(https, 'Strict-Transport-Security'), policy.hsts.enabled);
      assert.equal(Object.hasOwn(applyPolicy(base, policy, { https: true, localhost: true, route: '/selection' }), 'Strict-Transport-Security'), false);
      assert.equal(Object.hasOwn(applyPolicy(base, policy, { https: false, localhost: false, route: '/selection' }), 'Strict-Transport-Security'), false);
      assert.deepEqual(applyPolicy(base, policy, { https: true, localhost: false, route: '/health' }), base);
    } else { results.push({ unitId: unit.id, outcome: 'unverified' }); continue; }
    results.push({ unitId: unit.id, outcome: 'passed' });
  } catch { results.push({ unitId: unit.id, outcome: 'failed' }); }
}
const unknown = workspace.interfaces.length > 0 || workspace.endToEndRequirementIds.length > 0 || results.some(result => result.outcome === 'unverified');
console.log(JSON.stringify({ assurance: 'bounded', authoritativeAcceptance: false, requiredRunner: 'dedicated-linux-kvm-fresh-vm', results, aggregate: unknown ? 'unverified' : results.every(result => result.outcome === 'passed') ? 'passed' : 'failed' }));
process.exitCode = results.some(result => result.outcome === 'failed') ? 1 : unknown ? 2 : 0;
`,
  'INSTRUCTIONS.txt': 'Use the exact owner-approved public toolchain image digest in the contract. Mount this package as /work; dependencies are preinstalled under /opt/toolchain and no network/lifecycle installation is needed. Run node tooling/build.mjs, then node tooling/start.mjs for the public environment. Run node tooling/check.mjs for bounded development feedback. Worker and browser source are untrusted; do not run them on the private/development host. Development feedback is not an authoritative runner verdict. Required browser, policy, interface, end-to-end, transfer and preservation checks require the independent fresh-VM supervisor and are never inferred from unit success. Editable paths, fixed requirements, image/template digests and compensation terms are in release/contract.json. No real authentication, billing, deployment or private computation is supplied.\n'
};
