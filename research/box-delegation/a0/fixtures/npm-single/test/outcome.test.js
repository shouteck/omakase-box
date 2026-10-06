import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.js';

test('outcome: surrounding and repeated whitespace collapses', () => {
  assert.equal(slugify('  Hello   World '), 'hello-world');
});
