import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.js';

test('guard: single spaces become hyphens', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});
