import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, lstat, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { docker } from '../../../scripts/docker.mjs';

const root = resolve(import.meta.dirname, '../../..');
const context = resolve(root, 'templates/workspaces/image');
assert.equal(await realpath(context), context);
const allowed = ['.dockerignore','Dockerfile','bootstrap/package.json','bootstrap/package-lock.json','toolchain/package.json','toolchain/pnpm-lock.yaml','toolchain/pnpm-workspace.yaml','self-check.mjs'].sort();
const files = [];
async function inventory(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), relative = prefix + entry.name;
    assert.ok(!(await lstat(path)).isSymbolicLink(), 'Public image context must not follow links.');
    if (entry.isDirectory()) await inventory(path, relative + '/');
    else { assert.ok(entry.isFile() && allowed.includes(relative), 'Unexpected file in public-only context.'); const bytes = await readFile(path); files.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
  }
}
await inventory(context); files.sort((a,b) => a.path.localeCompare(b.path, 'en'));
assert.deepEqual(files.map(file => file.path).sort(), allowed);
const sourceContextHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
let existingDirectory = null, identity = null;
if (process.argv[2] === '--existing') {
  assert.match(process.argv[3] ?? '', /^public-image-audit-[A-Za-z0-9_-]+$/);
  existingDirectory = join(root, '.runtime', process.argv[3]);
  assert.equal(await realpath(existingDirectory), existingDirectory);
  identity = JSON.parse(await readFile(join(existingDirectory, 'identity.json'), 'utf8'));
  assert.equal(identity.kind, 'public-image-audit'); assert.equal(identity.sourceContextHash, sourceContextHash);
} else {
  const build = await docker(['build','--platform','linux/amd64','--tag','public-task-toolchain:m4-v1',context], { timeout: 600000 });
  assert.equal(build.code, 0, 'Public-only image build failed.');
}
const inspected = await docker(['image','inspect',identity?.imageDigest ?? 'public-task-toolchain:m4-v1']);
assert.equal(inspected.code, 0);
const [image] = JSON.parse(inspected.stdout);
assert.match(image.Id, /^sha256:[a-f0-9]{64}$/);
assert.equal(image.Config.User, 'pwuser');
assert.equal(image.Architecture, 'amd64');
const smoke = await docker(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--pids-limit','128','--tmpfs','/tmp:rw,size=128m',image.Id], { timeout: 60000 });
assert.equal(smoke.code, 0, 'Public tooling smoke failed.');
const tooling = JSON.parse(smoke.stdout); assert.equal(tooling.candidateExecuted, false);
const history = await docker(['history','--no-trunc','--format','{{json .}}',image.Id]); assert.equal(history.code, 0);
assert.ok(!/services\/private-api|private-shop|\.execution|PRIVATE_DATABASE|SESSION_KEY|RELEASE_KEY/.test(history.stdout), 'Private build provenance found in image history.');
const directory = existingDirectory ?? await mkdtemp(join(root, '.runtime', 'public-image-audit-'));
if (!existingDirectory) await writeFile(join(directory,'identity.json'), JSON.stringify({ kind:'public-image-audit', imageDigest:image.Id, sourceContextHash }) + '\n', { flag:'wx' });
const archive = join(directory, 'image.tar');
if (!existingDirectory) { const saved = await docker(['image','save','--output',archive,image.Id], { timeout: 240000 }); assert.equal(saved.code, 0); }
const scanner = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B',join(import.meta.dirname,'scan-public-image.py'),archive,image.Id], { encoding:'utf8', timeout:240000, maxBuffer:1048576, windowsHide:true });
assert.equal(scanner.status, 0, `Public layer scan failed: ${scanner.stdout?.slice(-2048)} ${scanner.stderr?.slice(-2048)}`);
const layers = JSON.parse(scanner.stdout); assert.deepEqual(layers.violations, []); assert.deepEqual(layers.layerDigests, image.RootFS.Layers);
const report = { schemaVersion:1, assurance:'tested', imageDigest:image.Id, sourceContextHash, files, tooling, layers, historySha256:createHash('sha256').update(history.stdout).digest('hex'), history:history.stdout.trim().split('\n').map(line => JSON.parse(line)), archive, actualVmValidation:'unverified', candidateExecuted:false };
const reportPath = join(import.meta.dirname,`public-image-${image.Id.slice(7)}.json`);
try { await writeFile(reportPath, JSON.stringify(report,null,2)+'\n',{flag:'wx'}); } catch(error) { if(error.code !== 'EEXIST') throw error; }
console.log(JSON.stringify({ assurance:'tested', imageDigest:image.Id, sourceContextHash, filesScanned:layers.filesScanned, bytesScanned:layers.bytesScanned, layerCount:layers.layerDigests.length, violations:layers.violations, actualVmValidation:'unverified', candidateExecuted:false, evidence:reportPath, archive }));
