import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { version as typescriptVersion } from 'typescript';

const require = createRequire(import.meta.url);
assert.equal(process.versions.node, '24.11.0');
assert.equal(typescriptVersion, '6.0.3');
assert.equal(require('react/package.json').version, '19.3.0');
assert.equal(require('@playwright/test/package.json').version, '1.63.0');
assert.equal(typeof build, 'function');
assert.notEqual(process.getuid(), 0);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>Public toolchain</title><button>Trusted smoke</button>');
  assert.equal(await page.title(), 'Public toolchain');
  assert.equal(await page.getByRole('button').textContent(), 'Trusted smoke');
} finally { await browser.close(); }
console.log(JSON.stringify({ assurance: 'tested', scope: 'Pinned public toolchain and trusted blank-browser smoke only; no task code, no VM/isolation/readiness claim.', node: process.versions.node, playwright: '1.63.0', typescript: typescriptVersion, react: '19.3.0', uid: process.getuid(), candidateExecuted: false }));
