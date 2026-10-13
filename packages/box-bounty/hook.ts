// The hook (BT9): an agent learns the state of the project's bounties at
// session start and is told once when a solution arrives during the session,
// on hosts that can run a command at fixed moments. It is off until the
// owner switches it on, and switching it on shows the owner plainly what it
// does, what it costs and what it may cause.
//
// One output command serves every host — `box bounty hook <slot>` — and each
// host is a thin adapter that only knows where that host keeps hook settings
// and what an entry looks like. Hosts implemented here are the ones whose
// hook format was verified against installed documentation on this machine:
// Devin CLI (bundled docs ship with the binary) and the .claude/settings.json
// format Devin also reads.
//
// Output reaching the agent is only what the tool generated: counts, ids,
// stages, times. Never a title, branch name or account name a stranger chose,
// and never a command's guess at what the agent should do — the command that
// shows more is named, nothing else.
//
// "Told once" is state in `.box/hook-told.json` inside the repository: each
// announced event is recorded when it is printed, so an event is announced
// once across sessions. A race between two sessions may announce an event
// twice — never lose it.

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BountyRefused } from './errors.js';
import { refreshGitHubStatus } from './github.js';
import { attemptsOf, isOpenStage, listRecords } from './record.js';
import type { BountyRecord } from './record.js';
import { readDecision } from './settings.js';

// ---------------------------------------------------------------------------
// The one shared output command
// ---------------------------------------------------------------------------

export type HookSlot = 'start' | 'pause' | 'finish';
export const HOOK_SLOTS: readonly HookSlot[] = ['start', 'pause', 'finish'];

// The lifecycle event each slot is wired to on every implemented host. Both
// implemented formats use these names (Devin's installed docs state its
// format is compatible with the .claude/settings.json one).
const SLOT_EVENT: Readonly<Record<HookSlot, string>> = {
  start: 'SessionStart',
  pause: 'UserPromptSubmit',
  finish: 'Stop'
};

// Ask GitHub at most once per this interval across every hook run in the
// project — "a few minutes", stated in the disclosure.
export const HOOK_GITHUB_INTERVAL_MS = 5 * 60 * 1000;
// Each single GitHub call gets this hard limit, so a hung network cannot
// stall a session. The entry written into the host's settings carries a
// timeout above the worst case of one refresh (a few calls at this cap).
export const HOOK_GH_CALL_LIMIT_MS = 8000;
const HOOK_ENTRY_TIMEOUT_SECONDS = 30;

const toldPath = (repoRoot: string): string => join(repoRoot, '.box', 'hook-told.json');

interface ToldState {
  lastGitHubAsk: string | null;
  readonly told: Record<string, string>;
}

// The tool owns this file: anything unreadable is treated as "nothing told
// yet" and rewritten — the hook must never fail on its own state.
function readTold(repoRoot: string): ToldState {
  const empty: ToldState = { lastGitHubAsk: null, told: {} };
  try {
    const parsed: unknown = JSON.parse(readFileSync(toldPath(repoRoot), 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
    const value = parsed as { lastGitHubAsk?: unknown; told?: unknown };
    const told: Record<string, string> = {};
    if (value.told !== null && typeof value.told === 'object' && !Array.isArray(value.told)) {
      for (const [key, at] of Object.entries(value.told as Record<string, unknown>)) {
        if (typeof at === 'string') told[key] = at;
      }
    }
    return { lastGitHubAsk: typeof value.lastGitHubAsk === 'string' ? value.lastGitHubAsk : null, told };
  } catch {
    return empty;
  }
}

// Atomic write: temp file + rename, so a session killed mid-write leaves the
// previous complete state, not a torn file.
function writeTold(repoRoot: string, state: ToldState): void {
  const path = toldPath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temp, `${JSON.stringify({ kind: 'box-hook-told', ...state }, null, 2)}\n`, 'utf8');
    renameSync(temp, path);
  } catch {
    try { rmSync(temp, { force: true }); } catch { /* nothing left behind on purpose */ }
  }
}

// The events worth telling, per open record: a solution that arrived — a
// collected attempt, or a pull request the tool has seen. Keys and lines are
// built only from tool-generated facts (id, PR number, commit, count), never
// outside text.
function arrivalKeys(record: BountyRecord): { key: string; line: string }[] {
  const out: { key: string; line: string }[] = [];
  const seenCommits = new Set<string>();
  for (const attempt of attemptsOf(record)) {
    if (seenCommits.has(attempt.commit)) continue;
    seenCommits.add(attempt.commit);
    out.push({ key: `solution:${record.id}:${attempt.commit}`, line: `a solution arrived for ${record.id} — read it: box bounty look ${record.id} ${attempt.n}; merge it: box bounty apply ${record.id} ${attempt.n}` });
  }
  const pullRequests = [...record.github?.seenPullRequests ?? [], ...record.github?.availablePullRequests ?? []];
  const seenPrs = new Set<string>();
  for (const pr of pullRequests) {
    const key = `solution:${record.id}:pr${pr.n}:${pr.commit}`;
    if (seenCommits.has(pr.commit) || seenPrs.has(key)) continue;
    seenPrs.add(key);
    out.push({ key, line: `a solution arrived for ${record.id} — collect pull request #${pr.n}: box bounty look ${record.id} ${pr.n}; merge it: box bounty apply ${record.id} ${pr.n}` });
  }
  return out;
}

// A merge try that conflicted is the other thing a session should not end
// without saying: the bounty waits on a resolution. Told once per conflict
// set — the key folds the recorded paths so a new conflict is told anew.
function conflictKeys(record: BountyRecord): { key: string; line: string }[] {
  const paths = record.conflicts?.paths;
  if (paths === undefined || paths === null || paths.length === 0) return [];
  return [{ key: `conflict:${record.id}:${paths.join(',')}`, line: `a merge try on ${record.id} conflicts in ${paths.length} path(s) — see: box bounty status ${record.id}` }];
}

export interface HookRun {
  /** The exact stdout the host should see: one JSON envelope, or null when
      there is nothing to say (the deliberate silent case). */
  readonly output: string | null;
  /** The context lines inside the envelope — for --explain's plain print. */
  readonly lines: readonly string[];
}

// The slot command's whole job: read the records (which recognises any
// merged solution first, once per process — and under the standing rules a
// recognised merge closes the bounty on GitHub with nobody asked), ask
// GitHub no more than once per interval while an open bounty is posted
// there, then say only what is worth paying context for and mark it told so
// it is never repeated.
//
// Everything is best-effort: the hook must never block a session, so a
// failure lands as a named fact line and the run still exits 0.
export function runHook(repoRoot: string, slot: HookSlot, notices: readonly string[]): HookRun {
  const lines: string[] = [...notices];
  const told = readTold(repoRoot);
  // State is written only when it changed or already exists — a silent run
  // in a project that never opened a bounty leaves nothing behind.
  let dirty = existsSync(toldPath(repoRoot));
  let listed;
  try {
    listed = listRecords(repoRoot);
  } catch (error) {
    return envelope(slot, [`box bounty: the records could not be read (${error instanceof BountyRefused ? error.reason : 'read-failed'}) — see: box bounty status`]);
  }
  const open = listed.filter(entry => entry.record !== null && isOpenStage(entry.record.stage)).map(entry => entry.record!);
  const corrupt = listed.filter(entry => entry.record === null).length;
  if (corrupt > 0) lines.push(`box bounty: ${corrupt} record file(s) under .box/bounties could not be read — see: box bounty status`);

  // GitHub is asked at most once per interval, only while an open bounty is
  // posted there. Each call carries a hard limit (limitGitHubCalls, applied
  // by the slot command before this runs), and the whole refresh is bounded
  // so the host entry's own timeout is never the real limit. The ask is
  // persisted before the calls: a host that kills the run mid-refresh still
  // leaves the interval marker behind.
  if (open.some(record => record.github?.state === 'posted')) {
    const lastAsk = told.lastGitHubAsk === null ? 0 : Date.parse(told.lastGitHubAsk);
    if (Date.now() - lastAsk >= HOOK_GITHUB_INTERVAL_MS) {
      told.lastGitHubAsk = new Date().toISOString();
      dirty = true;
      writeTold(repoRoot, told);
      const refreshStart = Date.now();
      for (const record of open) {
        if (Date.now() - refreshStart > HOOK_GH_CALL_LIMIT_MS) break;
        try { refreshGitHubStatus(repoRoot, record); } catch { /* refresh itself records unavailability on the record */ }
      }
    }
  }

  if (slot === 'start') {
    if (open.length === 0 && lines.length === 0) { if (dirty) writeTold(repoRoot, told); return { output: null, lines: [] }; }
    if (open.length > 0) {
      const summary = open.map(record => {
        const suffixes: string[] = [];
        const waiting = arrivalKeys(record).length;
        if (waiting > 0) suffixes.push(`${waiting} solution(s) waiting`);
        if (record.waiting !== undefined) suffixes.push('waits on the owner');
        const outside = record.github?.outside;
        if (record.github?.state === 'posted' && outside !== undefined) suffixes.push(`issue ${outside.issueState} as of ${outside.at}`);
        else if (record.github?.state === 'posted' && record.github.unavailableAt !== null && record.github.unavailableAt !== undefined) suffixes.push(`GitHub unreachable at ${record.github.unavailableAt}`);
        return `${record.id} ${record.stage}${suffixes.length > 0 ? ` (${suffixes.join(', ')})` : ''}`;
      }).join('; ');
      lines.push(`box bounty: ${open.length} open ${open.length === 1 ? 'bounty' : 'bounties'} — ${summary} — see: box bounty status`);
    }
    // Whatever the start already shows counts as told: a mid-session line is
    // only for what arrives while the session runs.
    for (const record of open) for (const event of [...arrivalKeys(record), ...conflictKeys(record)]) { told.told[event.key] = new Date().toISOString(); dirty = true; }
    if (dirty) writeTold(repoRoot, told);
    return envelope(slot, lines);
  }

  // pause and finish: only what is new, each event once.
  const fresh: { key: string; line: string }[] = [];
  for (const record of open) {
    for (const event of arrivalKeys(record)) if (told.told[event.key] === undefined) fresh.push(event);
    if (slot === 'finish') for (const event of conflictKeys(record)) if (told.told[event.key] === undefined) fresh.push(event);
  }
  for (const event of fresh) { told.told[event.key] = new Date().toISOString(); dirty = true; }
  if (dirty) writeTold(repoRoot, told);
  lines.push(...fresh.map(event => `box bounty: ${event.line}`));
  return envelope(slot, lines);
}

// The envelope hosts read for context injection: hookSpecificOutput with the
// event's own name — the shape both implemented hosts document.
function envelope(slot: HookSlot, lines: readonly string[]): HookRun {
  if (lines.length === 0) return { output: null, lines: [] };
  const output = JSON.stringify({ hookSpecificOutput: { hookEventName: SLOT_EVENT[slot], additionalContext: lines.join('\n') } });
  return { output, lines };
}

// ---------------------------------------------------------------------------
// The host adapters: where each host keeps hook settings, what an entry is
// ---------------------------------------------------------------------------

export interface HookHost {
  readonly name: string;
  /** Settings file inside the project. */
  readonly file: string;
  /** True when entries nest under a top-level "hooks" member
      (.claude/settings.json); false when the whole file is the events map
      (.devin/hooks.v1.json). */
  readonly nested: boolean;
  /** What the documentation verified on this machine says about its slots. */
  readonly slotsNote: string;
}

export const HOOK_HOSTS: readonly HookHost[] = [
  { name: 'devin', file: '.devin/hooks.v1.json', nested: false, slotsNote: 'SessionStart, UserPromptSubmit and Stop (verified against the hooks documentation installed with Devin CLI on this machine)' },
  { name: 'claude', file: '.claude/settings.json', nested: true, slotsNote: 'SessionStart, UserPromptSubmit and Stop (the .claude/settings.json hooks format; Devin reads this file too)' }
];

export function hookHost(name: string | undefined): HookHost {
  const found = HOOK_HOSTS.find(host => host.name === name);
  if (found === undefined) {
    throw new BountyRefused('hook-unknown-host', `${name === undefined ? 'no host named' : `${JSON.stringify(name)} is not a host the hook can be installed for`} — known hosts: ${HOOK_HOSTS.map(host => host.name).join(', ')}; nothing changed`);
  }
  return found;
}

export const HOOK_COMMAND = 'box bounty hook';
const slotCommand = (slot: HookSlot): string => `${HOOK_COMMAND} ${slot}`;

// The groups one `hook on` writes — one per wired slot, under the event name
// each host fires. An empty matcher runs the entry on every event of that
// type; the timeout bounds the whole hook run.
export function hookGroups(): Record<string, unknown[]> {
  const group = (slot: HookSlot) => [{ matcher: '', hooks: [{ type: 'command', command: slotCommand(slot), timeout: HOOK_ENTRY_TIMEOUT_SECONDS }] }];
  return { [SLOT_EVENT.start]: group('start'), [SLOT_EVENT.pause]: group('pause'), [SLOT_EVENT.finish]: group('finish') };
}

// An entry is ours when every command inside it is a slot command this tool
// writes. A group mixing our command with somebody else's is left alone —
// the owner splits those by hand.
const isOurs = (group: unknown): boolean => {
  if (group === null || typeof group !== 'object' || Array.isArray(group)) return false;
  const hooks = (group as { hooks?: unknown }).hooks;
  if (!Array.isArray(hooks) || hooks.length === 0) return false;
  return hooks.every(hook => hook !== null && typeof hook === 'object' && !Array.isArray(hook)
    && (hook as { type?: unknown }).type === 'command'
    && typeof (hook as { command?: unknown }).command === 'string'
    && /^box bounty hook (start|pause|finish)( |$)/.test((hook as { command: string }).command));
};

// ---------------------------------------------------------------------------
// JSON-with-comments splicing. The settings file keeps every byte the tool
// did not write — comments, formatting, other hosts' entries — by parsing
// just enough to find insertion and removal spans, then editing the text.
// ---------------------------------------------------------------------------

interface Token { readonly kind: string; readonly start: number; readonly end: number; readonly text: string }
interface Member { readonly key: string; readonly start: number; readonly end: number; readonly value: Span }
interface Span { readonly kind: 'object' | 'array' | 'scalar'; readonly start: number; readonly end: number; readonly members?: Member[]; readonly elements?: Span[] }

// A minimal JSONC scanner: strings and the six structural characters become
// tokens; comments and whitespace are skipped; anything else is one literal
// token.
function scan(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { i += 1; continue; }
    if (ch === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i += 1; continue; }
    if (ch === '/' && text[i + 1] === '*') { const close = text.indexOf('*/', i + 2); i = close < 0 ? text.length : close + 2; continue; }
    if ('{}[]:,'.includes(ch)) { tokens.push({ kind: ch, start: i, end: i + 1, text: ch }); i += 1; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') { if (text[j] === '\\') j += 1; j += 1; }
      j += 1; // one past the closing quote — a missing one fails the member check below
      tokens.push({ kind: 'string', start: i, end: j, text: text.slice(i, j) });
      i = j; continue;
    }
    const start = i;
    while (i < text.length && !'{}[]:," \t\r\n/'.includes(text[i]!)) i += 1;
    if (i === start) i += 1; else tokens.push({ kind: 'literal', start, end: i, text: text.slice(start, i) });
  }
  return tokens;
}

// Structural parse producing spans. Trailing commas are accepted — hosts
// that read these files accept them — but every member needs a string key
// and every structure must close, or the file is malformed.
function parseSpan(tokens: readonly Token[], at: number): { span: Span; next: number } | null {
  const token = tokens[at];
  if (token === undefined) return null;
  if (token.kind === '{') {
    const members: Member[] = [];
    let i = at + 1;
    while (tokens[i] !== undefined && tokens[i]!.kind !== '}') {
      const key = tokens[i]!;
      if (key.kind !== 'string' || tokens[i + 1]?.kind !== ':') return null;
      let keyText: string;
      try { keyText = JSON.parse(key.text) as string; } catch { return null; }
      const value = parseSpan(tokens, i + 2);
      if (value === null) return null;
      members.push({ key: keyText, start: key.start, end: value.span.end, value: value.span });
      i = value.next;
      if (tokens[i]?.kind === ',') i += 1;
    }
    if (tokens[i]?.kind !== '}') return null;
    return { span: { kind: 'object', start: token.start, end: tokens[i]!.end, members }, next: i + 1 };
  }
  if (token.kind === '[') {
    const elements: Span[] = [];
    let i = at + 1;
    while (tokens[i] !== undefined && tokens[i]!.kind !== ']') {
      const value = parseSpan(tokens, i);
      if (value === null) return null;
      elements.push(value.span);
      i = value.next;
      if (tokens[i]?.kind === ',') i += 1;
    }
    if (tokens[i]?.kind !== ']') return null;
    return { span: { kind: 'array', start: token.start, end: tokens[i]!.end, elements }, next: i + 1 };
  }
  if (token.kind === 'string' || token.kind === 'literal') return { span: { kind: 'scalar', start: token.start, end: token.end }, next: at + 1 };
  return null;
}

// The file as an editable structure, or a named refusal — the hook refuses
// by name on a file it cannot parse rather than damaging it.
function readSettings(path: string): { text: string; root: Span } {
  const text = readFileSync(path, 'utf8');
  const tokens = scan(text);
  const parsed = tokens.length === 0 ? null : parseSpan(tokens, 0);
  if (parsed === null || parsed.next !== tokens.length || parsed.span.kind !== 'object') {
    throw new BountyRefused('hook-settings-malformed', `${path} is not a readable JSON object — fix the file or remove it and run hook on again; nothing changed`);
  }
  return { text, root: parsed.span };
}

// Positions move with every splice, so each mutation re-parses the current
// text — slower than tracking offsets, immune to bookkeeping drift.
function reparse(text: string, path: string): Span {
  const tokens = scan(text);
  const parsed = parseSpan(tokens, 0);
  if (parsed === null || parsed.next !== tokens.length || parsed.span.kind !== 'object') {
    throw new BountyRefused('hook-settings-malformed', `${path}: the file could not be re-read while being edited; nothing changed`);
  }
  return parsed.span;
}

// The object holding the event arrays for this host: the root object itself
// for a standalone hooks file, or the value of its "hooks" member inside a
// settings file.
function container(root: Span, host: HookHost): Span | null {
  if (!host.nested) return root;
  const member = root.members?.find(entry => entry.key === 'hooks');
  if (member === undefined) return null;
  return member.value.kind === 'object' ? member.value : null;
}

// Insert `piece` as the last element of an array span or the last member of
// an object span — always appended at the end with a leading comma when the
// container is non-empty, which is what lets removal restore the file byte
// for byte.
function insertLast(text: string, span: Span, piece: string): string {
  const closingAt = span.end - 1;
  const empty = (span.members ?? span.elements ?? []).length === 0;
  return `${text.slice(0, closingAt)}${empty ? piece : `,${piece}`}${text.slice(closingAt)}`;
}

// Remove one element or member from its container, with its separating
// comma: the comma before it when it is not the first entry, else the comma
// after it. Comma positions come from a token scan, so a comma inside a
// comment or string is never mistaken for the separator.
function removeEntry(text: string, containerSpan: Span, entry: { start: number; end: number }): string {
  const entries = (containerSpan.members ?? containerSpan.elements ?? []) as readonly { start: number; end: number }[];
  const index = entries.findIndex(item => item.start === entry.start && item.end === entry.end);
  if (index === -1) return text;
  const commas = scan(text).filter(token => token.kind === ',').map(token => token.start);
  if (index > 0) {
    const comma = commas.filter(at => at > entries[index - 1]!.end && at < entry.start).at(-1);
    if (comma !== undefined) return `${text.slice(0, comma)}${text.slice(entry.end)}`;
  }
  const comma = commas.find(at => at >= entry.end && at < containerSpan.end - 1);
  if (comma !== undefined) return `${text.slice(0, entry.start)}${text.slice(comma + 1)}`;
  return `${text.slice(0, entry.start)}${text.slice(entry.end)}`;
}

// The file's text after adding this host's groups, or a named refusal. A
// file the tool creates holds only its own entries; an existing file keeps
// every other byte — the splice only ever appends.
function addEntries(path: string, host: HookHost, groups: Record<string, unknown[]>): string {
  if (!existsSync(path) || readFileSync(path, 'utf8').trim() === '') {
    return host.nested ? `${JSON.stringify({ hooks: groups }, null, 2)}\n` : `${JSON.stringify(groups, null, 2)}\n`;
  }
  let text = readFileSync(path, 'utf8');
  let root = reparse(text, path);
  let box = container(root, host);
  if (host.nested && box === null) {
    const member = root.members!.find(entry => entry.key === 'hooks');
    if (member !== undefined) {
      throw new BountyRefused('hook-settings-malformed', `${path}: "hooks" is not an object — fix the file; nothing changed`);
    }
    text = insertLast(text, root, `\n  "hooks": ${JSON.stringify(groups, null, 2).replaceAll('\n', '\n  ')}`);
    root = reparse(text, path);
    box = container(root, host);
  }
  if (box === null) throw new BountyRefused('hook-settings-malformed', `${path}: the hooks object could not be found; nothing changed`);
  // Refuse to double-install: our entries already present means the hook is
  // on — or the file was hand-edited into a shape `off` must sort out.
  for (const member of box.members!) {
    if (member.value.kind !== 'array') continue;
    for (const element of member.value.elements!) {
      let group: unknown = null;
      try { group = JSON.parse(text.slice(element.start, element.end)); } catch { continue; }
      if (isOurs(group)) {
        throw new BountyRefused('hook-already-on', `the hook is already installed in ${host.file} ("${member.key}"); nothing changed — remove it with box bounty hook off --host ${host.name}`);
      }
    }
  }
  for (const event of Object.keys(groups)) {
    const current = reparse(text, path);
    const currentBox = container(current, host)!;
    const member = currentBox.members!.find(entry => entry.key === event);
    if (member === undefined) {
      text = insertLast(text, currentBox, `\n    "${event}": ${JSON.stringify(groups[event], null, 2).replaceAll('\n', '\n    ')}`);
    } else if (member.value.kind !== 'array') {
      throw new BountyRefused('hook-settings-malformed', `${path}: "${event}" is not a list of hook entries — fix the file; nothing changed`);
    } else {
      for (const group of groups[event]!) {
        const again = reparse(text, path);
        const againMember = container(again, host)!.members!.find(entry => entry.key === event)!;
        text = insertLast(text, againMember.value, JSON.stringify(group));
      }
    }
  }
  return text;
}

// Remove every entry that is ours. An event member whose elements are all
// ours goes with them — its whole span is one splice, which restores the
// file whether `hook on` created the member or added to it. A member that
// still holds somebody else's entry keeps its name and every other element,
// and an empty array the owner wrote by hand is never touched: only spans
// that contain our commands are ever spliced. `text: null` means the file
// should be deleted; `text: ''` restores an originally empty file.
function removeEntries(path: string, host: HookHost, install: HookInstall | null): { text: string | null; removed: number } {
  if (!existsSync(path)) return { text: null, removed: 0 };
  let text = readFileSync(path, 'utf8');
  readSettings(path); // refusal on a malformed file — never a blind delete
  let removed = 0;
  // Each splice moves positions: re-parse, remove one thing, repeat until no
  // entry of ours remains.
  for (let pass = 0; pass < 64; pass += 1) {
    const root = reparse(text, path);
    const box = container(root, host);
    if (box === null) break;
    let acted = false;
    for (const member of [...box.members!]) {
      if (member.value.kind !== 'array') continue;
      const ours = member.value.elements!.map(element => {
        try { return isOurs(JSON.parse(text.slice(element.start, element.end))); } catch { return false; }
      });
      if (!ours.includes(true)) continue;
      if (ours.every(Boolean)) {
        removed += ours.length;
        text = removeEntry(text, box, member);
      } else {
        text = removeEntry(text, member.value, member.value.elements![ours.indexOf(true)]!);
        removed += 1;
      }
      acted = true;
      break;
    }
    if (!acted) break;
  }
  const root = reparse(text, path);
  if (host.nested) {
    const box = container(root, host);
    // Only an install record proves the "hooks" member is ours to drop —
    // an empty one the owner wrote stays.
    if (box !== null && box.members!.length === 0 && install?.createdContainer === true) {
      const member = root.members!.find(entry => entry.key === 'hooks')!;
      text = removeEntry(text, root, member);
    }
    const after = reparse(text, path);
    if (install?.createdFile === true && after.members!.length === 0) return { text: null, removed };
    if (install?.emptyFile === true && after.members!.length === 0) return { text: '', removed };
    return { text, removed };
  }
  if (root.members!.length === 0) return { text: install?.emptyFile === true ? '' : null, removed };
  return { text, removed };
}

// ---------------------------------------------------------------------------
// The owner-facing commands
// ---------------------------------------------------------------------------

const settingsPath = (repoRoot: string, host: HookHost): string => join(repoRoot, ...host.file.split('/'));

// The settings file must resolve inside this project — a junction or a link
// that escapes the checkout is a named refusal, never a write.
function checkedSettingsPath(repoRoot: string, host: HookHost): string {
  const path = settingsPath(repoRoot, host);
  const root = realpathSync(repoRoot).replaceAll('\\', '/');
  const inside = (resolved: string): boolean => resolved === root || resolved.startsWith(`${root}/`);
  const dir = dirname(path);
  if (existsSync(dir) && !inside(realpathSync(dir).replaceAll('\\', '/'))) {
    throw new BountyRefused('hook-settings-escape', `${dir} resolves outside this project — the hook only writes settings inside the project; nothing changed`);
  }
  if (existsSync(path) && !inside(realpathSync(path).replaceAll('\\', '/'))) {
    throw new BountyRefused('hook-settings-escape', `${path} resolves outside this project — the hook only writes settings inside the project; nothing changed`);
  }
  return path;
}

// `.box/hook-on.json`: what `hook on` created per host, so `hook off` puts
// the file back exactly — delete a file it made, drop a "hooks" member it
// made, restore an empty file it filled, and never touch an empty structure
// that was already there. The tool owns this file like hook-told.json.
interface HookInstall {
  /** The settings file did not exist before `hook on` — `off` may delete it. */
  readonly createdFile: boolean;
  /** It existed but held only whitespace — `off` restores it to empty. */
  readonly emptyFile: boolean;
  /** The "hooks" member itself was created by `hook on` (nested hosts). */
  readonly createdContainer: boolean;
}

const installsPath = (repoRoot: string): string => join(repoRoot, '.box', 'hook-on.json');

function readInstalls(repoRoot: string): Record<string, HookInstall> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(installsPath(repoRoot), 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const hosts = (parsed as { hosts?: unknown }).hosts;
    if (hosts === null || typeof hosts !== 'object' || Array.isArray(hosts)) return {};
    const out: Record<string, HookInstall> = {};
    for (const [name, value] of Object.entries(hosts as Record<string, unknown>)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        out[name] = { createdFile: record.createdFile === true, emptyFile: record.emptyFile === true, createdContainer: record.createdContainer === true };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeInstalls(repoRoot: string, installs: Record<string, HookInstall>): void {
  const path = installsPath(repoRoot);
  if (Object.keys(installs).length === 0) { rmSync(path, { force: true }); return; }
  const temp = `${path}.tmp-${process.pid}`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temp, `${JSON.stringify({ kind: 'box-hook-on', hosts: installs }, null, 2)}\n`, 'utf8');
    renameSync(temp, path);
  } catch {
    try { rmSync(temp, { force: true }); } catch { /* bookkeeping loss degrades off to conservative */ }
  }
}

function countOurs(text: string, box: Span): number {
  let count = 0;
  for (const member of box.members ?? []) {
    if (member.value.kind !== 'array') continue;
    for (const element of member.value.elements ?? []) {
      try { if (isOurs(JSON.parse(text.slice(element.start, element.end)))) count += 1; } catch { /* not ours */ }
    }
  }
  return count;
}

export function hookStatus(repoRoot: string): string {
  const lines: string[] = [];
  for (const host of HOOK_HOSTS) {
    const path = settingsPath(repoRoot, host);
    if (!existsSync(path)) { lines.push(`${host.name}: off — ${host.file} does not exist`); continue; }
    try {
      const text = readFileSync(path, 'utf8');
      const { root } = readSettings(path);
      const box = container(root, host);
      const ours = box === null ? 0 : countOurs(text, box);
      lines.push(ours > 0 ? `${host.name}: on — ${ours} hook entrie(s) in ${host.file}` : `${host.name}: off — no box hook entries in ${host.file}`);
    } catch (error) {
      lines.push(`${host.name}: ${host.file} cannot be read (${error instanceof BountyRefused ? error.reason : 'unreadable'}) — fix the file by hand`);
    }
  }
  lines.push(`switch on: box bounty hook on --host <${HOOK_HOSTS.map(host => host.name).join('|')}> — prints the disclosure first and changes nothing until --confirm`);
  return lines.join('\n');
}

export function hookOff(repoRoot: string, host: HookHost): string {
  const path = checkedSettingsPath(repoRoot, host);
  if (!existsSync(path)) throw new BountyRefused('hook-not-on', `the hook is not on for ${host.name} — ${host.file} does not exist; nothing changed`);
  const installs = readInstalls(repoRoot);
  const { text, removed } = removeEntries(path, host, installs[host.name] ?? null);
  if (removed === 0) throw new BountyRefused('hook-not-on', `the hook is not on for ${host.name} — no box entries in ${host.file}; nothing changed`);
  if (text === null) rmSync(path, { force: true });
  else writeFileSync(path, text);
  delete installs[host.name];
  writeInstalls(repoRoot, installs);
  return `hook off — removed ${removed} hook entrie(s) for ${host.name} from ${host.file}${text === null ? ' (the file held nothing else and was removed)' : ''}`;
}


// The disclosure `hook on` prints before it writes anything — every sentence
// a fact about what the hook does, touches, costs and may cause.
export function hookDisclosure(repoRoot: string, host: HookHost): string {
  const path = settingsPath(repoRoot, host);
  const groups = hookGroups();
  const entriesText = Object.entries(groups).map(([event, value]) => `  "${event}": ${JSON.stringify(value)}`).join('\n');
  const lines = [
    `switching on the box bounty hook for ${host.name}`,
    '',
    'what it does:',
    '- at the start of each session it shows the agent the state of open bounties (ids and stages only), once',
    '- during a session it tells the agent once when a solution arrives, at the next prompt or when the agent is about to stop',
    '- it is silent at every other moment and adds nothing when no bounty is open',
    `- on this host it uses ${host.slotsNote}`,
    '',
    'what it touches:',
    `- it writes hook entries into ${host.file} inside this project — the exact lines are below; everything already in the file is preserved byte for byte`,
    `- the entries run: ${slotCommand('start')}, ${slotCommand('pause')} and ${slotCommand('finish')} — reading this project's .box/bounties records and writing .box/hook-told.json (what agents have been told) and .box/hook-on.json (what hook on installed, so hook off restores exactly)`,
    `- it contacts GitHub through your gh sign-in at most once every ${HOOK_GITHUB_INTERVAL_MS / 60000} minutes, only while an open bounty is posted there; each call is capped at ${HOOK_GH_CALL_LIMIT_MS / 1000} seconds and the host entry itself times out at ${HOOK_ENTRY_TIMEOUT_SECONDS} seconds`
  ];
  const decision = (() => { try { return readDecision(repoRoot); } catch { return null; } })();
  if (decision !== null && (decision.decision === 'allowed' || decision.decision === 'ask')) {
    lines.push('- under the standing rules in force (merges are never gated), when a solution the tool handed out is merged, the hook reading the records closes the bounty: the GitHub issue is closed with a comment and nobody is asked');
  }
  lines.push(
    '',
    'what it costs:',
    '- at most a few lines of context per session: one line of open-bounty state at the start, and one line per new event during; zero when no bounty is open',
    '',
    'how it may affect the agent:',
    "- a line about bounties can pull the agent's attention from the task in hand, and the agent may act on what it sees",
    '',
    'what it never does:',
    "- never runs a solver's code, never shows a stranger's text (no titles, account names, branch names or issue bodies), never tells the agent what to do beyond naming the command that shows more, never blocks or waits on anything",
    '',
    `how to stop it: box bounty hook off --host ${host.name} — removes exactly these entries`,
    '',
    `the entries that would be added to ${path}:`,
    host.nested ? '  under the "hooks" key:' : '  the file is the hooks object itself:',
    entriesText,
    '',
    `nothing was written (hook-unconfirmed) — switch it on with: box bounty hook on --host ${host.name} --confirm`
  );
  return lines.join('\n');
}

export function hookOn(repoRoot: string, host: HookHost): string {
  const path = checkedSettingsPath(repoRoot, host);
  // Before writing, record exactly what the write will create — `hook off`
  // restores by this record, never by guessing.
  const existed = existsSync(path);
  const emptyBefore = existed && readFileSync(path, 'utf8').trim() === '';
  const createdContainer = host.nested && (emptyBefore || !existed
    || readSettings(path).root.members!.find(member => member.key === 'hooks') === undefined);
  mkdirSync(dirname(path), { recursive: true });
  const text = addEntries(path, host, hookGroups());
  writeFileSync(path, text);
  const installs = readInstalls(repoRoot);
  installs[host.name] = { createdFile: !existed, emptyFile: existed && emptyBefore, createdContainer };
  writeInstalls(repoRoot, installs);
  return `hook on — wrote ${Object.keys(hookGroups()).length} hook entrie(s) for ${host.name} to ${host.file}\n  sessions on this host now see open-bounty state at start and new arrivals once, until: box bounty hook off --host ${host.name}`;
}
