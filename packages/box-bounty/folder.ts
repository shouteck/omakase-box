import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// BT64: one repository folder, one spelling. On Windows a folder can be
// reached by its 8.3 short name and its long name, and JavaScript's
// realpathSync keeps whichever it was given, while Git's toplevel and
// realpathSync.native give the long one. Keys and inside-or-outside
// comparisons built from both spellings disagreed: a never-publish entry
// written through one did not hold a create through the other. Every place
// that turns the repository folder (or a path judged against it) into a key
// or a base uses this one function. On macOS it gives the resolved
// /private/... form; on Linux it is plain realpath.
export function canonicalFolder(path: string): string {
  return realpathSync.native(path);
}

/** A path that may not exist yet (a file a merge could create), in the same
    spelling: the nearest existing ancestor canonical, the rest re-appended.
    A lexical fallback here kept the given spelling while the root was
    resolved, so a solver's not-yet-written path read as outside the
    repository (macOS /var vs /private/var, K50 run 42802182752). */
export function canonicalPath(target: string): string {
  const tail: string[] = [];
  let cursor = target;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return target; // no existing ancestor — keep the spelling
    tail.unshift(basename(cursor));
    cursor = parent;
  }
  return join(canonicalFolder(cursor), ...tail);
}

const sameFolder =(a: string, b: string): boolean =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

const resolvesTo = (key: string, canonical: string): boolean => {
  try { return sameFolder(canonicalFolder(key), canonical); } catch { return false; }
};

// The stored key that names `root`'s folder: the canonical spelling first,
// else a key stored before BT64 in another spelling of the same folder, so an
// older never-publish list keeps holding.
function keyFor(map: Readonly<Record<string, unknown>> | undefined, root: string): string | undefined {
  if (map === undefined) return undefined;
  const canonical = canonicalFolder(root);
  if (Object.hasOwn(map, canonical)) return canonical;
  return Object.keys(map).find(key => resolvesTo(key, canonical));
}

/** The entry a folder-keyed map holds for this repository folder, however either was spelled. */
export function folderEntry<T>(map: Readonly<Record<string, T>> | undefined, root: string): T | undefined {
  const key = keyFor(map, root);
  return key === undefined || map === undefined ? undefined : map[key];
}

/** The map with this folder's entry set under its canonical key; any other
    spelling of the same folder is dropped (read both, write one). */
export function withFolderEntry<T>(map: Readonly<Record<string, T>> | undefined, root: string, value: T): Record<string, T> {
  const canonical = canonicalFolder(root);
  const out: Record<string, T> = {};
  for (const [key, entry] of Object.entries(map ?? {})) if (key !== canonical && !resolvesTo(key, canonical)) out[key] = entry;
  out[canonical] = value;
  return out;
}
