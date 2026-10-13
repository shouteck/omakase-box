import { BountyRefused } from './errors.js';
import { commandConfig } from './git.js';

// Authority and transport name the same GitHub repository. Folder paths and
// remote names are never identities, and URL rewrites cannot redirect a yes.
export function repositoryAddress(value: string): string | null {
  const address = value.replace(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/i, '');
  const match = /^([a-z\d][a-z\d-]{0,38})\/([a-z\d_.-]+?)(?:\.git)?$/i.exec(address);
  if (match === null || match[2] === '.' || match[2] === '..') return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
}

export function repositoryIdentity(root: string): string | null {
  const config = commandConfig(root);
  const remotes = config.filter(entry => /^remote\..*\.(url|pushurl)$/.test(entry.key));
  if (remotes.length === 0) return null;
  const identities = new Set<string>();
  for (const remote of remotes) {
    // Remote URL fields require a GitHub URL, never a local owner/name path.
    const address = /^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/i.test(remote.value)
      ? repositoryAddress(remote.value) : null;
    if (address === null) throw new BountyRefused('github-remote-required', 'every remote must name a GitHub repository address; this repository has a remote without one, so it cannot be listed');
    identities.add(address);
  }
  if (identities.size !== 1) {
    const remoteNames = new Set(remotes.map(entry => entry.key.slice(0, entry.key.lastIndexOf('.'))));
    throw new BountyRefused(remoteNames.size === 1 ? 'github-remote-mismatch' : 'repository-address-ambiguous', 'the remotes name different GitHub repositories; a yes for one cannot cover another. Make the fetch and push addresses name one repository');
  }
  const identity = [...identities][0];
  if (identity === undefined) return null;
  for (const url of [...remotes.map(entry => entry.value), `https://github.com/${identity}.git`]) {
    for (const push of [false, true]) {
      const pushMatches = push ? config.filter(entry => entry.key.startsWith('url.') && entry.key.endsWith('.pushinsteadof') && url.startsWith(entry.value)) : [];
      const matches = pushMatches.length > 0 ? pushMatches : config.filter(entry => entry.key.startsWith('url.') && entry.key.endsWith('.insteadof') && url.startsWith(entry.value));
      matches.sort((left, right) => right.value.length - left.value.length);
      const rewrite = matches[0];
      if (rewrite === undefined) continue;
      const base = rewrite.key.slice(4, rewrite.key.lastIndexOf('.'));
      const rewritten = base + url.slice(rewrite.value.length);
      if (!/^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/i.test(rewritten)
        || repositoryAddress(rewritten) !== identity) {
        throw new BountyRefused('repository-destination-mismatch', 'a Git URL rewrite sends this repository to a different destination; nothing was allowed or posted. Remove the rewrite or make the addresses agree');
      }
    }
  }
  return identity;
}

export function requireRepository(root: string): string {
  const identity = repositoryIdentity(root);
  if (identity === null) throw new BountyRefused('repository-address-required', 'this repository has no GitHub address, so it cannot be listed. Add a GitHub remote, then run box bounty allow');
  return identity;
}
