import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './process.mjs';

export const demoRoot = join(root, '.runtime', 'private-shop-demo');
export async function seedPrivateShop() {
  const fixtureRoot = join(root, 'examples', 'private-shop');
  const fixture = JSON.parse(await readFile(join(fixtureRoot, 'fixture.json'), 'utf8'));
  if (fixture.kind !== 'synthetic-private-shop' || fixture.schemaVersion !== 1) throw new Error('Unrecognized private fixture.');
  await mkdir(demoRoot, { recursive: true });
  if ((await lstat(demoRoot)).isSymbolicLink()) throw new Error('Linked demo directories are forbidden.');
  const resolvedDemo = await realpath(demoRoot);
  const resolvedFixture = await realpath(fixtureRoot);
  const contained = (parent, child) => { const path = relative(parent, child); return path && !path.startsWith('..') && !isAbsolute(path); };
  const marker = join(demoRoot, 'identity.json');
  if ((await readdir(demoRoot)).length) {
    const identity = JSON.parse(await readFile(marker, 'utf8'));
    if (identity.kind !== 'synthetic-private-shop-demo' || identity.schemaVersion !== 1) throw new Error('Unrecognized demo directory; refusing to overwrite.');
  } else await writeFile(marker, JSON.stringify({ kind: 'synthetic-private-shop-demo', schemaVersion: 1 }) + '\n', { flag: 'wx' });
  const assets = [];
  for (const path of fixture.snapshotPaths) {
    if (!/^(src|config)\/[A-Za-z0-9_./-]+$/.test(path) || path.split('/').some(segment => segment === '..' || segment === '.') || path.includes('reference-solutions')) throw new Error('Unsafe fixture snapshot path.');
    const source = join(fixtureRoot, path);
    const info = await lstat(source);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || !contained(resolvedFixture, await realpath(source)) || info.size > 1048576) throw new Error('Unsafe fixture source.');
    const bytes = await readFile(source);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const target = join(demoRoot, 'objects', digest);
    await mkdir(dirname(target), { recursive: true });
    if (!contained(resolvedDemo, await realpath(dirname(target)))) throw new Error('Linked object stores are forbidden.');
    try { await writeFile(target, bytes, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || !(await lstat(target)).isFile() || (await lstat(target)).isSymbolicLink() || (await lstat(target)).nlink !== 1 || !bytes.equals(await readFile(target))) throw error; }
    assets.push({ path, sha256: digest, bytes: bytes.length });
  }
  const snapshotHash = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
  const snapshotPath = join(demoRoot, `snapshot-${snapshotHash}.json`);
  const snapshot = JSON.stringify({ schemaVersion: 1, kind: 'synthetic-private-shop-snapshot', preChangeRevision: fixture.preChangeRevision, snapshotHash, assets, referenceSolutionsIncluded: false }, null, 2) + '\n';
  try { await writeFile(snapshotPath, snapshot, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST' || await readFile(snapshotPath, 'utf8') !== snapshot) throw error; }
  return { assurance: 'tested', kind: 'synthetic_only', snapshotHash, assetCount: assets.length, referenceSolutionsIncluded: false };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await seedPrivateShop()));
