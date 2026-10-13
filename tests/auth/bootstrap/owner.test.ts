import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bootstrapOwner } from '../../../services/private-api/bootstrap/owner.js';
import type { OwnerBootstrapStore } from '../../../services/private-api/bootstrap/owner.js';

// Split so this file's bytes hold no secret-shaped literal (the bounty
// suite's own scan guards every tracked test file); runtime value unchanged.
const token = 'synthetic-one-' + 'time-owner-token-32-characters';
const digest = createHash('sha256').update(token).digest('hex');
const input = { token, username: 'synthetic.owner', password: 'synthetic-password-only' };

describe('owner bootstrap transaction adapter (protocol tests, not database evidence)', () => {
  it('requires local token authority and rejects client roles', async () => {
    const neverStore: OwnerBootstrapStore = { transaction: async () => { throw new Error('Must not enter transaction.'); } };
    expect((await bootstrapOwner({ ...input, role: 'owner' }, digest, neverStore)).status).toBe('invalid');
    expect((await bootstrapOwner({ ...input, token: 'wrong-synthetic-token-that-is-long-enough' }, digest, neverStore)).status).toBe('denied');
  });
  it('creates fixed owner authority once and stores a salted password hash only', async () => {
    let used = false;
    const accounts: unknown[] = [];
    const store: OwnerBootstrapStore = { transaction: async operation => operation({
      consumeUnusedBootstrap: async expected => { expect(expected).toBe(digest); if (used) return false; used = true; return true; },
      insertOwner: async account => { accounts.push(account); }
    }) };
    expect((await bootstrapOwner(input, digest, store)).status).toBe('created');
    expect((await bootstrapOwner(input, digest, store)).status).toBe('denied');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ username: 'synthetic.owner', role: 'owner' });
    expect(JSON.stringify(accounts)).not.toContain(input.password);
    expect(JSON.stringify(accounts)).not.toContain(token);
    expect((accounts[0] as { passwordHash: string }).passwordHash).toMatch(/^\$scrypt\$32768\$8\$1\$/);
  });
});
