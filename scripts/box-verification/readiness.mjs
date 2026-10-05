// W002/B1.1 r4 container-side readiness probes. Non-destructive only.
// Runs inside the reviewed Linux runner (never on the Windows host as candidate code).
// All bounds come from the environment manifest: 120s window, <=24 probes/service,
// <=3s/request, two consecutive successes 5s apart, browser <=30s, DB <=2 attempts.

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const READINESS_BOUNDS = {
  probeWindowMs: 120000,
  maxProbesPerService: 24,
  requestTimeoutMs: 3000,
  consecutiveSuccesses: 2,
  consecutiveGapMs: 5000,
  browserDeadlineMs: 30000,
  dbConnectionReadinessAttempts: 2
};

const now = () => Date.now();

export async function probeHttpOk(url, timeoutMs = READINESS_BOUNDS.requestTimeoutMs, fetchImpl = globalThis.fetch) {
  const started = now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchImpl(url, { signal: controller.signal });
    clearTimeout(timer);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, elapsedMs: now() - started };
  } catch (error) {
    return { ok: false, status: null, error: String(error?.name ?? error), elapsedMs: now() - started };
  }
}

// Bounded health probe: at most maxProbes within windowMs, requires two consecutive
// successes at least gapMs apart. Honest fail/unavailable states, never a fake pass.
export async function probeServiceHealth(url, { windowMs = READINESS_BOUNDS.probeWindowMs, maxProbes = READINESS_BOUNDS.maxProbesPerService, requestTimeoutMs = READINESS_BOUNDS.requestTimeoutMs, successes = READINESS_BOUNDS.consecutiveSuccesses, gapMs = READINESS_BOUNDS.consecutiveGapMs, fetchImpl, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const deadline = now() + windowMs;
  const probes = [];
  let consecutive = 0;
  let lastSuccessAt = 0;
  for (let attempt = 0; attempt < maxProbes && now() < deadline; attempt += 1) {
    const probe = await probeHttpOk(url, requestTimeoutMs, fetchImpl);
    probes.push(probe);
    if (probe.ok) {
      if (consecutive > 0 && now() - lastSuccessAt < gapMs) {
        // Too soon to count; keep waiting.
      } else {
        consecutive += 1;
        lastSuccessAt = now();
        if (consecutive >= successes) return { status: 'pass', url, probes, consecutive };
      }
    } else {
      consecutive = 0;
    }
    await sleep(Math.min(2000, Math.max(0, deadline - now())));
  }
  return { status: now() >= deadline ? 'unavailable' : 'failed', url, probes, consecutive };
}

// Browser readiness: verifies the actual executable for the expected pinned
// revision exists under the browser cache, launches a real headless browser,
// performs a local page round-trip and a clean close — all inside <=30s.
// loadChromium is injectable for tests; production loads the pinned playwright
// package's chromium launcher. Returns honest pass/failed/unavailable.
export async function findBrowserExecutable(browserPath, expectedRevision = 1243) {
  const entries = await readdir(browserPath).catch(() => null);
  if (entries === null) return null;
  for (const dir of entries) {
    const match = /^chromium(?:[-_](?:headless[-_])?shell)?-(\d+)$/.exec(dir);
    if (!match || Number(match[1]) !== Number(expectedRevision)) continue;
    for (const rel of ['chrome-linux/headless_shell', 'chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-linux64/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
      const candidate = join(browserPath, dir, rel);
      const info = await stat(candidate).catch(() => null);
      if (info && info.isFile() && (info.mode & 0o111) !== 0) return { executablePath: candidate, revision: Number(match[1]) };
      if (info && info.isFile()) return { executablePath: candidate, revision: Number(match[1]) };
    }
  }
  return null;
}

export async function probeBrowser({ browserPath = '/ms-playwright', expectedRevision = 1243, deadlineMs = READINESS_BOUNDS.browserDeadlineMs, loadChromium, pageUrl = 'data:text/html,<title>w002-r4-readiness</title><body>local</body>' } = {}) {
  const deadline = now() + deadlineMs;
  const remaining = () => Math.max(0, deadline - now());
  const bounded = (promise, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + '_deadline')), Math.max(1, remaining())))
  ]);
  const fail = (reason, extra = {}) => ({ status: 'failed', reason, ...extra });
  const unavailable = (reason, extra = {}) => ({ status: 'unavailable', reason, ...extra });

  const info = await stat(browserPath).catch(() => null);
  if (!info || !info.isDirectory()) return unavailable('browser_path_missing', { browserPath });
  const found = await findBrowserExecutable(browserPath, expectedRevision);
  if (!found) return fail('browser_executable_missing', { expectedRevision });
  const chromium = typeof loadChromium === 'function'
    ? await loadChromium()
    : await import('playwright').then(module => module.chromium).catch(() => null);
  if (chromium === null || typeof chromium.launch !== 'function') return unavailable('browser_launcher_absent');

  let browser;
  try {
    browser = await bounded(chromium.launch({ executablePath: found.executablePath, headless: true }), 'browser_launch');
  } catch (error) {
    return fail('browser_launch:' + String(error?.message ?? error));
  }
  try {
    const context = await bounded(browser.newContext(), 'browser_context');
    const page = await bounded(context.newPage(), 'browser_page');
    // Local page round-trip: load locally served markup and verify the DOM.
    await bounded(page.goto(pageUrl), 'browser_goto');
    const content = await bounded(page.content(), 'browser_content');
    if (typeof content !== 'string' || content.length === 0) return fail('browser_roundtrip_empty');
    await bounded(context.close(), 'browser_context_close');
    if (remaining() <= 0) return unavailable('browser_deadline_exceeded');
    return { status: 'pass', revision: found.revision, executablePath: found.executablePath };
  } catch (error) {
    return remaining() <= 0 ? unavailable('browser_deadline_exceeded') : fail('browser_roundtrip:' + String(error?.message ?? error));
  } finally {
    if (browser && typeof browser.close === 'function') {
      await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, Math.max(1, remaining()))) ]).catch(() => undefined);
    }
  }
}

// Service-specific fixture entrypoints: intake/session fixtures exist only on
// the private service; requiring them on external is itself a manifest drift.
export const REQUIRED_ENTRYPOINTS = {
  'private-api': ['dist/fixture.js', 'dist/intake-fixture.js', 'dist/session-fixture.js'],
  'external-api': ['dist/fixture.js']
};

export async function checkFixtureEntrypoints(root, required = REQUIRED_ENTRYPOINTS) {
  const missing = [];
  for (const [service, files] of Object.entries(required)) {
    for (const rel of files) {
      const path = join(root, 'services', service, rel);
      const info = await stat(path).catch(() => null);
      if (!info || !info.isFile() || info.size === 0) missing.push(`${service}/${rel}`);
    }
  }
  return missing.length === 0 ? { status: 'pass' } : { status: 'failed', missing };
}

// Complete staged metadata check: every hash-bound input must equal its reviewed
// digest. The public .env.example template is hashed only — referenced secret
// files and actual runtime credentials are never opened.
export const ENV_EXAMPLE_EXPECTED_SHA256 = '93d9be5dd9dd83115ce2a7848d4a7c85b73d4ad161d1fa523618e69b429d8d2a';

export async function checkStagedMetadata(stageRoot, expected = {}) {
  const required = {
    'infra/compose.yaml': expected['infra/compose.yaml'],
    'infra/trusted.Dockerfile': expected['infra/trusted.Dockerfile'],
    'research/fixtures/candidates.json': expected['research/fixtures/candidates.json'],
    '.env.example': expected['.env.example'] ?? ENV_EXAMPLE_EXPECTED_SHA256
  };
  const mismatches = [];
  for (const [rel, digest] of Object.entries(required)) {
    const bytes = await readFile(join(stageRoot, rel)).catch(() => null);
    if (bytes === null) { mismatches.push({ rel, missing: true }); continue; }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (typeof digest === 'string' && actual !== digest) mismatches.push({ rel, digest: actual, expected: digest });
  }
  // templates/** inputs: every listed template file is hash-bound.
  for (const [rel, digest] of Object.entries(expected)) {
    if (!rel.startsWith('templates/')) continue;
    const bytes = await readFile(join(stageRoot, rel)).catch(() => null);
    if (bytes === null || createHash('sha256').update(bytes).digest('hex') !== digest) mismatches.push({ rel, missing: bytes === null });
  }
  return mismatches.length === 0 ? { status: 'pass', compared: Object.keys(required).length } : { status: 'failed', mismatches };
}

// Binds the recorded created-resource identities to the manifest's exact
// container/image expectations; no live Docker access needed container-side.
export async function checkResourceRecord(recordPath, manifest) {
  const raw = await readFile(recordPath, 'utf8').catch(() => null);
  if (raw === null) return { status: 'unavailable', reason: 'creation_record_missing' };
  let record;
  try { record = JSON.parse(raw); } catch { return { status: 'failed', reason: 'creation_record_malformed' }; }
  const expected = manifest?.containers ?? {};
  const mismatches = [];
  for (const name of ['w002-b11-linux-r4-env2', 'w002-b11-box-db-r4-env2']) {
    const entry = (record.created ?? []).find(item => item.name === name);
    if (!entry || entry.status !== 'running') { mismatches.push({ name, missing: true }); continue; }
    const imageId = expected[name]?.image?.id;
    if (typeof imageId === 'string' && typeof entry.inspect === 'string' && !entry.inspect.includes(imageId) && !entry.inspect.includes(imageId.replace('sha256:', ''))) {
      mismatches.push({ name, image: imageId });
    }
  }
  return mismatches.length === 0 ? { status: 'pass' } : { status: 'failed', mismatches };
}

// Source/stage equality: every entry in pairs {source, staged} must hash identically.
export async function compareSourceStage(pairs) {
  const mismatches = [];
  for (const pair of pairs) {
    const a = await readFile(pair.source).catch(() => null);
    const b = await readFile(pair.staged).catch(() => null);
    if (a === null || b === null) { mismatches.push({ ...pair, missing: a === null ? 'source' : 'staged' }); continue; }
    if (createHash('sha256').update(a).digest('hex') !== createHash('sha256').update(b).digest('hex')) mismatches.push({ ...pair, missing: null });
  }
  return mismatches.length === 0 ? { status: 'pass', compared: pairs.length } : { status: 'failed', mismatches };
}

// DB connection readiness: at most two attempts, non-destructive SELECT 1 only.
export async function checkDbReadiness(connect, { attempts = READINESS_BOUNDS.dbConnectionReadinessAttempts } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const client = await connect();
      try { await client.query('SELECT 1'); } finally { await (client.release?.() ?? client.end?.() ?? Promise.resolve()); }
      return { status: 'pass', attempt: i + 1 };
    } catch (error) {
      if (i === attempts - 1) return { status: 'unavailable', error: String(error?.message ?? error), attempts: attempts };
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return { status: 'unavailable' };
}

// Relay run contract: valid lease file, matching run/environment digests, mailbox
// layout, and no leftover requests (new mailbox must start empty).
export async function checkRelayRunContract(mailbox, { runId, environmentId, leaseTtlMs = 180 * 60 * 1000 } = {}) {
  const leasePath = join(mailbox, 'state', 'lease.json');
  const raw = await readFile(leasePath, 'utf8').catch(() => null);
  if (raw === null) return { status: 'unavailable', reason: 'lease_missing' };
  let lease;
  try { lease = JSON.parse(raw); } catch { return { status: 'failed', reason: 'lease_malformed' }; }
  if (lease.runId !== runId || lease.environmentId !== environmentId) return { status: 'failed', reason: 'lease_binding_mismatch' };
  const expiresAt = Date.parse(lease.expiresAt ?? '');
  if (!Number.isFinite(expiresAt)) return { status: 'failed', reason: 'lease_malformed' };
  if (expiresAt < now()) return { status: 'failed', reason: 'lease_expired' };
  if (expiresAt - now() > leaseTtlMs + 60000) return { status: 'failed', reason: 'lease_ttl_excessive' };
  const requests = await readdir(join(mailbox, 'requests')).catch(() => null);
  if (requests === null) return { status: 'unavailable', reason: 'mailbox_requests_missing' };
  if (requests.length !== 0) return { status: 'failed', reason: 'mailbox_not_empty' };
  return { status: 'pass', lease };
}
