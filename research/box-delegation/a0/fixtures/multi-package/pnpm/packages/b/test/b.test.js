import test from 'node:test';
import assert from 'node:assert/strict';
import { cents } from '../src/index.js';

test('cents', () => {
  assert.equal(cents('1.50'), 150);
});
