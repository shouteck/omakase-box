import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { startLocal } from '../../packages/box-platform/src/local.js';

const platform = fileURLToPath(new URL('../../packages/box-platform/', import.meta.url));
const rehearsal = join(platform, 'local-board-rehearsal.mjs');

it('rehearses a CLI post, discovery, take, submission, merge and recorded payment on the local board', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'box-local-rehearsal-'));
  try {
    const board = await startLocal({ schema: join(platform, 'schema.sql'), out: join(platform, 'out'), replayDir: scratch });
    try {
      await board.refresh();
      await board.env.DB.prepare("DELETE FROM meta WHERE key LIKE 'budget_%'").run();
      const { stdout } = await promisify(execFile)(process.execPath, [rehearsal, scratch, board.url], { timeout: 85000 });
      expect(stdout).toContain('Posted on the local board:');
      expect(stdout).toContain('Recorded paid on the local board (no money moved):');
    } finally {
      await board.stop();
    }
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}, 90000);
