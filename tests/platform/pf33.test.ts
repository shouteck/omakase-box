// PF33: the board reads a bounty's task from its issue up to the tool's next heading. The tool writes "What was already
// tried" only when the poster wrote a note, so a new issue without one goes straight to "How to answer". Issues posted
// before PF33 keep their old layout and must read the same.
import { describe, expect, it } from 'vitest';
import { taskOf } from '../../packages/box-platform/src/refresh.js';

const at = (body: string) => body.length;

describe('the task, read from the issue', () => {
  it('reads an issue posted before PF33, with its "What was already tried" section', () => {
    const body = '# Bounty: x\n\nid bt-1 · created …\n\n## What is wanted\n\nMake the export keep its order.\n\n## What was already tried\n\nSorting by id.\n\n## The code\n\nBranch from …\n';
    expect(taskOf(body, at(body))).toBe('Make the export keep its order.');
  });

  it('reads a PF33 issue with a note, and one without', () => {
    const withNote = '# Bounty: x\n\n$5 for the merged solution · bt-1 · posted 4 Nov 2026\n\n## What is wanted\n\nMake the export keep its order.\n\n## What was already tried\n\nSorting by id.\n\n## How to answer\n\n1. Fork …\n';
    const without = '# Bounty: x\n\n$5 for the merged solution · bt-1 · posted 4 Nov 2026\n\n## What is wanted\n\nMake the export keep its order.\n\n## How to answer\n\n1. Fork …\n\n## Reward\n\n$5 …\n';
    expect(taskOf(withNote, at(withNote))).toBe('Make the export keep its order.');
    expect(taskOf(without, at(without))).toBe('Make the export keep its order.');
  });

  it('keeps a task\'s own headings', () => {
    const body = '# Bounty: x\n\n## What is wanted\n\nDo two things.\n\n## Step one\n\nFirst.\n\n## How to answer\n\n1. Fork …\n';
    expect(taskOf(body, at(body))).toBe('Do two things.\n\n## Step one\n\nFirst.');
  });
});
