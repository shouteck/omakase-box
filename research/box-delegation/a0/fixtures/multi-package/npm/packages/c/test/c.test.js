import test from 'node:test';
import assert from 'node:assert/strict';
import { shout } from '../src/index.js';

test('shout', () => {
  assert.equal(shout('hi'), 'HI!');
});
