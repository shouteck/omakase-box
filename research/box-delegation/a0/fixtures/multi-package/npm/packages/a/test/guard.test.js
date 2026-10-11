import test from 'node:test';
import assert from 'node:assert/strict';
import { total } from '../src/index.js';

test('guard: sums prices in cents', () => {
  assert.equal(total([{ price: '1.50' }, { price: '2.25' }]), 375);
});
