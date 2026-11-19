import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export function writeVersion(directory, env = process.env) {
  const sha = env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('The build requires a full 40-character Git SHA.');
  const version = { sha, builtAt: new Date().toISOString() };
  writeFileSync(new URL('public/version.json', directory), JSON.stringify(version) + '\n');
  return version;
}
