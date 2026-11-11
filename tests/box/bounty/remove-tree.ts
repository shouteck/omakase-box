// K61: removing a scratch folder. On Windows a folder that holds a copy of node.exe or git.exe cannot be removed while a
// process spawned from the copy still runs (EPERM, EBUSY), and a slow runner holds it longer than a short retry waits. That
// is no verdict on the code under test, so the helper retries for about seven seconds, then leaves the folder in the temp
// area and says so by returning false. Any other fault is thrown at once: a cleanup that fails for a real reason still fails.
// No side effects on import, so a kitchen test can read it. Hosted runs 43027294715 and 43088503658.
import { rmSync } from 'node:fs';

const HELD = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);
const ATTEMPTS = 8;
const STEP_MS = 250;
const sleep = (ms: number): void => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

type Remover = (dir: string, options: { recursive: true; force: true }) => void;

/** True when the folder is gone; false when Windows still holds it after the last try (it is left behind, not a failure). */
export function removeTree(dir: string, remove: Remover = rmSync, wait: (ms: number) => void = sleep): boolean {
  for (let attempt = 1; ; attempt += 1) {
    try {
      remove(dir, { recursive: true, force: true });
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === undefined || !HELD.has(code)) throw error;
      if (attempt >= ATTEMPTS) return false;
      wait(STEP_MS * attempt);
    }
  }
}
