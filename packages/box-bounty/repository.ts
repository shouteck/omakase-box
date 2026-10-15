import { BountyRefused } from './errors.js';
import { commandConfig } from './git.js';

type ConfigEntries = ReturnType<typeof commandConfig>;

// Authority and transport name the same GitHub repository. Folder paths and
// remote names are never identities, and URL rewrites cannot redirect a yes.
export function repositoryAddress(value: string): string | null {
  const address = value.replace(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/i, '');
  const match = /^([a-z\d][a-z\d-]{0,38})\/([a-z\d_.-]+?)(?:\.git)?$/i.exec(address);
  if (match === null || match[2] === '.' || match[2] === '..') return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
}

const GITHUB_URL = /^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/i;

/** One GitHub repository the remotes name: its normalized address, the names
    of the remotes that carry it and the remote URL spellings that name it —
    everything the choice and the rewrite check need, read once. */
export interface RemoteCandidate {
  readonly address: string;
  readonly remotes: readonly string[];
  readonly urls: readonly string[];
}

/** The repository this checkout is, after the remotes and the owner's list
    are read: `one` carries the chosen address; `unlisted` carries the
    several candidates none of which is on the list. */
export type RepositoryChoice =
  | { readonly kind: 'one'; readonly address: string; readonly candidates: readonly RemoteCandidate[] }
  | { readonly kind: 'unlisted'; readonly candidates: readonly RemoteCandidate[] };

// The one line per candidate the choice-needed refusal and the owner wait
// lines share: which repository, which remote names it, the command that
// settles it — plus the once-written ask form (rule 6).
export function repositoryChoiceLines(candidates: readonly RemoteCandidate[]): string[] {
  return [
    ...candidates.map(candidate => `  allow ${candidate.address} (remote ${candidate.remotes.join(', ')}): box bounty allow ${candidate.address}`),
    '  or ask me each time: add --ask'
  ];
}

// Rules 1 to 4's reading of the remotes, nothing else: every remote's url and
// pushurl is inspected; an entry that is not a GitHub address takes no part
// and never causes a refusal; one remote naming two different GitHub
// addresses refuses github-remote-mismatch; remotes but no GitHub among them
// refuses github-remote-required; no remotes at all is null.
function remoteCandidates(config: ConfigEntries): RemoteCandidate[] | null {
  const entries = config.filter(entry => /^remote\..*\.(url|pushurl)$/.test(entry.key));
  if (entries.length === 0) return null;
  const byRemote = new Map<string, string[]>();
  for (const entry of entries) {
    const name = entry.key.slice('remote.'.length, entry.key.lastIndexOf('.'));
    const urls = byRemote.get(name) ?? [];
    urls.push(entry.value);
    byRemote.set(name, urls);
  }
  const found = new Map<string, { remotes: string[]; urls: string[] }>();
  for (const [name, urls] of byRemote) {
    const addresses = [...new Set(urls.map(url => GITHUB_URL.test(url) ? repositoryAddress(url) : null).filter((address): address is string => address !== null))];
    if (addresses.length > 1) throw new BountyRefused('github-remote-mismatch', `remote ${name} names different GitHub repositories; a yes for one cannot cover another. Make its fetch and push addresses name one repository`);
    const address = addresses[0];
    if (address === undefined) continue;  // not GitHub: no part in identity, never contacted
    const candidate = found.get(address) ?? { remotes: [], urls: [] };
    candidate.remotes.push(name);
    candidate.urls.push(...urls.filter(url => repositoryAddress(url) === address));
    found.set(address, candidate);
  }
  if (found.size === 0) throw new BountyRefused('github-remote-required', 'no remote names a GitHub repository; add one, then run box bounty allow');
  return [...found.entries()].map(([address, candidate]) => ({ address, remotes: candidate.remotes, urls: candidate.urls }));
}

/** The candidate list alone — for callers that need the remotes' GitHub
    addresses without choosing one. Same refusals as chooseRepository's read. */
export function githubRemotes(root: string): RemoteCandidate[] | null {
  return remoteCandidates(commandConfig(root));
}

// The candidates and the chosen repository, in one read (BT16). With one
// candidate the owner's list is never consulted. With several, `listed`
// decides: exactly one on it resolves; none leaves the checkout unlisted;
// more than one refuses — a yes for one repository never covers another.
// The rewrite check runs for the chosen address only: its canonical URL and
// every remote URL that names it. Rewrites on other candidates are ignored —
// the tool never contacts them.
export function chooseRepository(root: string, listed: ReadonlySet<string>): RepositoryChoice | null {
  const config = commandConfig(root);
  const candidates = remoteCandidates(config);
  if (candidates === null) return null;
  let chosen: RemoteCandidate;
  if (candidates.length === 1) chosen = candidates[0]!;
  else {
    const onList = candidates.filter(candidate => listed.has(candidate.address));
    if (onList.length === 0) return { kind: 'unlisted', candidates };
    if (onList.length > 1) {
      const named = onList.map(candidate => `${candidate.address} (remote ${candidate.remotes.join(', ')})`).join(' and ');
      throw new BountyRefused('repository-several-allowed', `remotes ${named} are all on the list; the tool cannot tell which one this checkout is — a yes for one repository never covers another. Take all but one off the list with box bounty deny <owner/name>, or work from a checkout whose remotes name one`);
    }
    chosen = onList[0]!;
  }
  for (const url of [`https://github.com/${chosen.address}.git`, ...chosen.urls]) {
    for (const push of [false, true]) {
      const pushMatches = push ? config.filter(entry => entry.key.startsWith('url.') && entry.key.endsWith('.pushinsteadof') && url.startsWith(entry.value)) : [];
      const matches = pushMatches.length > 0 ? pushMatches : config.filter(entry => entry.key.startsWith('url.') && entry.key.endsWith('.insteadof') && url.startsWith(entry.value));
      matches.sort((left, right) => right.value.length - left.value.length);
      const rewrite = matches[0];
      if (rewrite === undefined) continue;
      const base = rewrite.key.slice(4, rewrite.key.lastIndexOf('.'));
      const rewritten = base + url.slice(rewrite.value.length);
      if (!GITHUB_URL.test(rewritten) || repositoryAddress(rewritten) !== chosen.address) {
        throw new BountyRefused('repository-destination-mismatch', 'a Git URL rewrite sends this repository to a different destination; nothing was allowed or posted. Remove the rewrite or make the addresses agree');
      }
    }
  }
  return { kind: 'one', address: chosen.address, candidates };
}
