// BT101: the local log's one reducer. A bounty's record is the fold of its events: `created` and `imported` carry a whole
// document; every other intent (INTENTS, below) carries the leaves one write changed (path and new value, or the path
// removed) and the stage history it appended; `dropped` ends the row but not the history. Logs from before stage 4 also
// hold `replaced` (a whole document) and `patched` (a patch), which still fold. store.ts keeps the record row as this
// fold's cache, and a test checks the two agree after every write path.
export type JsonPath = readonly string[];
export interface Patch { readonly set: readonly (readonly [JsonPath, unknown])[]; readonly unset: readonly JsonPath[]; readonly events: readonly unknown[] }
export interface LocalEvent { readonly seq: number; readonly at: string; readonly kind: string; readonly json: string }

const isPlain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The leaves `next` changed against `base`, by path; objects are walked, everything else (arrays included) is a leaf. */
export function diffLeaves(base: unknown, next: unknown, path: string[] = []): { set: [JsonPath, unknown][]; unset: JsonPath[] } {
  const set: [JsonPath, unknown][] = [];
  const unset: JsonPath[] = [];
  if (isPlain(base) && isPlain(next)) {
    for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
      if (path.length === 0 && key === 'events') continue; // the stage history is appended, never replaced
      if (!(key in next) || next[key] === undefined) { if (key in base && base[key] !== undefined) unset.push([...path, key]); continue; }
      const inner = diffLeaves(base[key], next[key], [...path, key]);
      set.push(...inner.set);
      unset.push(...inner.unset);
    }
    return { set, unset };
  }
  if (JSON.stringify(base) !== JSON.stringify(next)) set.push([path, next]);
  return { set, unset };
}

export function readPath(doc: unknown, path: JsonPath): unknown {
  let at: unknown = doc;
  for (const key of path) { if (!isPlain(at)) return undefined; at = at[key]; }
  return at;
}

/** Apply a patch to a document in place. */
export function applyPatch(doc: Record<string, unknown>, patch: Patch): void {
  for (const [path, value] of patch.set) {
    if (path.length === 0) continue;
    let at = doc;
    for (const key of path.slice(0, -1)) { if (!isPlain(at[key])) at[key] = {}; at = at[key] as Record<string, unknown>; }
    at[path.at(-1)!] = structuredClone(value);
  }
  for (const path of patch.unset) {
    let at: unknown = doc;
    for (const key of path.slice(0, -1)) { if (!isPlain(at)) break; at = at[key]; }
    if (isPlain(at)) delete at[path.at(-1)!];
  }
  if (patch.events.length > 0) (doc['events'] as unknown[]).push(...structuredClone(patch.events));
}

// BT101 stage 4: every change names what happened. `created` and `imported` carry a whole document; `dropped` ends the
// row; every other intent carries a patch (the leaves changed, or, for a copy with no read behind it, every leaf that
// differs from the row). The generic `patched` and `replaced` are never written again; logs from before still fold.
export const INTENTS = [
  'created', 'imported', 'dropped',
  // posting
  'post-planned', 'post-held', 'branch-pushed', 'issue-recorded', 'post-incomplete', 'posted', 'held', 'owner-answered',
  // solutions coming back
  'solution-collected', 'answers-seen', 'seen-marked', 'conflicts-recorded',
  // what GitHub and the shared memory say
  'github-refreshed', 'format-observed', 'landing-checked', 'adopted',
  // endings
  'applied', 'merge-observed', 'closed', 'undone', 'stage-changed',
  // the ending going out, and the money
  'decision-sent', 'decision-pending', 'decision-refused', 'paid-recorded'
] as const;
export type Intent = (typeof INTENTS)[number];
const WHOLE = new Set(['created', 'imported', 'replaced']);
const PATCHES = new Set<string>(['patched', ...INTENTS.filter(intent => !WHOLE.has(intent) && intent !== 'dropped')]);
/** Does this event kind carry a patch (the paths `status <id> --history` names)? */
export const carriesPatch = (kind: string): boolean => PATCHES.has(kind);

/** The record a bounty's events describe, or null before the first document. */
export function foldLocal(events: readonly LocalEvent[]): Record<string, unknown> | null {
  let doc: Record<string, unknown> | null = null;
  for (const event of events) {
    const value = JSON.parse(event.json) as unknown;
    if (WHOLE.has(event.kind)) doc = structuredClone(value as Record<string, unknown>);
    else if (PATCHES.has(event.kind) && doc !== null) applyPatch(doc, value as Patch);
  }
  return doc;
}
