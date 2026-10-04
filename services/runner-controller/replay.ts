import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export interface ReplayStore { claim(jobId: string): Promise<void> }
export class FileReplayStore implements ReplayStore {
  constructor(private readonly directory: string) {}
  async claim(jobId: string) {
    z.uuid().parse(jobId);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = await open(join(this.directory, jobId + '.claim'), 'wx', 0o600);
    try { await file.writeFile('claimed\n'); await file.sync(); } finally { await file.close(); }
  }
}
