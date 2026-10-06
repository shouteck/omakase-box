import test from 'node:test';
import assert from 'node:assert/strict';
import { total } from '../src/index.js';

test('outcome: quantity multiplies the line price', () => {
  assert.equal(total([{ price: '1.50', qty: 2 }, { price: '2.25' }]), 525);
});
