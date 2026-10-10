// The owner's limits file: `.box/limits.json` at the repository root, written
// once by the owner and read at the boundary — never shipped (`.box` is a
// never-ship segment). This module is the parse boundary: it reads the bytes
// and type-checks the known fields. Canonicalizing the paths they name
// (junction-safe, repo-relative) happens in record.ts's `resolveLimits`.
//
//   {
//     "reminders": "off" | "on",            // default "off"
//     "rulesFile": "AGENTS.md",             // optional — repo-relative path of the
//                                           // rules file holding the marked block
//     "cost": "each bounty costs …",        // optional one line, shown by describe
//     "expectedAnswer": "usually a day",    // optional one line, shown by describe
//     "allowedDestinations": ["drop"]       // optional — dirs post --to must land
//                                           // inside; absent = any local folder
//   }
//
// A missing file means defaults. Malformed JSON, a non-object document, or a
// known field of the wrong shape is the named refusal `limits-malformed` —
// the file exists but the tool cannot understand what the owner set, and
// silently ignoring a limit would not be a safe default. Unknown fields are
// ignored.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BountyRefused } from './errors.js';

export const LIMITS_FILE = join('.box', 'limits.json');

export interface BountyLimits {
  readonly reminders: 'off' | 'on';
  readonly rulesFile?: string;
  readonly cost?: string;
  readonly expectedAnswer?: string;
  readonly allowedDestinations?: readonly string[];
}

const DEFAULTS: BountyLimits = { reminders: 'off' };

export function loadLimits(repoRoot: string): BountyLimits {
  const path = join(repoRoot, LIMITS_FILE);
  if (!existsSync(path)) return DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new BountyRefused('limits-malformed', `${path} is not readable JSON (${error instanceof Error ? error.message : String(error)}) — fix it or remove it; the owner's limits are read before anything mutates or posts`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BountyRefused('limits-malformed', `${path} must hold a JSON object — fix it or remove it`);
  }
  const raw = parsed as Record<string, unknown>;
  const bad = (field: string, wants: string): never => {
    throw new BountyRefused('limits-malformed', `${path}: "${field}" must be ${wants} — fix it or remove it`);
  };
  const text = (field: string): string | undefined => {
    const value = raw[field];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return bad(field, 'a string');
    return value;
  };
  const reminders = raw['reminders'];
  if (reminders !== undefined && reminders !== 'on' && reminders !== 'off') bad('reminders', '"on" or "off"');
  const destinations = raw['allowedDestinations'];
  if (destinations !== undefined && (!Array.isArray(destinations) || destinations.some(dir => typeof dir !== 'string'))) {
    bad('allowedDestinations', 'a list of directory paths');
  }
  const rulesFile = text('rulesFile');
  const cost = text('cost');
  const expectedAnswer = text('expectedAnswer');
  return {
    reminders: (reminders ?? 'off') as 'off' | 'on',
    ...(rulesFile !== undefined ? { rulesFile } : {}),
    ...(cost !== undefined ? { cost } : {}),
    ...(expectedAnswer !== undefined ? { expectedAnswer } : {}),
    ...(destinations !== undefined ? { allowedDestinations: [...(destinations as string[])] } : {})
  };
}
