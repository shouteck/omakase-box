import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { composeArguments } from '../synthetic-runtime.mjs';

export const REQUEST_INPUT_MAX = 65536;
export const OUTPUT_MAX = 262144;
export const SOURCE_MAX = 65536;

const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function loadManifest(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.entries) || typeof parsed.containers !== 'object' || parsed.containers === null) throw new Error('fixture_transport_manifest_invalid');
  return parsed;
}

export function matchEntry(manifest, args) {
  if (!Array.isArray(args)) throw new Error('fixture_transport_denied:argv_shape');
  for (let index = 0; index < composeArguments.length; index += 1) if (args[index] !== composeArguments[index]) throw new Error('fixture_transport_denied:compose_prefix');
  const tail = args.slice(composeArguments.length);
  if (tail[0] !== 'exec' || tail[1] !== '-T') throw new Error('fixture_transport_denied:operation');
  if (tail.length < 6) throw new Error('fixture_transport_denied:argv_shape');
  let index = 2;
  const env = [];
  while (tail[index] === '--env') {
    const pair = tail[index + 1];
    if (typeof pair !== 'string' || pair.length > 256 || !/^[A-Z_]+=[A-Za-z0-9_-]+$/.test(pair)) throw new Error('fixture_transport_denied:env');
    env.push(pair);
    index += 2;
  }
  if (tail[index] !== '--workdir') throw new Error('fixture_transport_denied:workdir');
  const workdir = tail[index + 1];
  const service = tail[index + 2];
  const argv = tail.slice(index + 3);
  if (typeof workdir !== 'string' || typeof service !== 'string' || argv.length === 0) throw new Error('fixture_transport_denied:argv_shape');
  for (const entry of manifest.entries) {
    if (entry.service !== service || entry.workdir !== workdir || entry.argv.length !== argv.length) continue;
    if (JSON.stringify([...(entry.env ?? [])].sort()) !== JSON.stringify([...env].sort())) continue;
    let matched = true;
    for (let part = 0; part < argv.length; part += 1) {
      if (entry.argv[part] === '@SOURCE@') {
        if (typeof argv[part] !== 'string' || argv[part].length > SOURCE_MAX || sha256(argv[part]) !== entry.sourceSha256) { matched = false; break; }
      } else if (argv[part] !== entry.argv[part]) { matched = false; break; }
    }
    if (matched) return entry;
  }
  throw new Error('fixture_transport_denied:unlisted_command');
}

async function readLifecycleState(mailbox) {
  try {
    const raw = await readFile(join(mailbox, 'state', 'lifecycle.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed?.state === 'string' ? parsed.state : null;
  } catch { return null; }
}

export async function execViaMailbox(args, { input, timeout = 120000, mailbox, manifest, runId } = {}) {
  const manifestData = manifest ?? await loadManifest(join(mailbox, 'fixture-command-manifest.json'));
  const entry = matchEntry(manifestData, args);
  if (entry.input === 'none' && input !== undefined && input !== null && input !== '') throw new Error('fixture_transport_denied:stdin');
  // Run/environment binding applies to run-bound manifests: the client must
  // present the run-scoped identity and the relay must be in the ready state.
  // Legacy parser/test manifests without a runId keep their request shape; the
  // host still refuses their execution without a bound lease context.
  let boundRunId = null;
  if (manifestData.runId !== undefined) {
    boundRunId = runId ?? process.env.BOX_VERIFICATION_RUN_ID;
    if (typeof boundRunId !== 'string' || !/^[A-Za-z0-9_.-]{4,128}$/.test(boundRunId)) throw new Error('fixture_transport_denied:run_binding');
    if (manifestData.runId !== boundRunId) throw new Error('fixture_transport_denied:run_binding');
    const state = await readLifecycleState(mailbox);
    if (state !== 'ready') throw new Error('fixture_transport_unavailable:relay_' + (state ?? 'missing'));
  }
  const requestId = randomUUID();
  const tail = args.slice(composeArguments.length);
  const sourceIndex = entry.argv.indexOf('@SOURCE@');
  const source = sourceIndex === -1 ? null : String(tail[tail.length - entry.argv.length + sourceIndex]);
  const request = { schemaVersion: 1, requestId, commandId: entry.id, ...(boundRunId === null ? {} : { runId: boundRunId }), source, input: input === undefined ? null : String(input) };
  const body = JSON.stringify(request);
  if (body.length > 16384 || (request.input ?? '').length > REQUEST_INPUT_MAX) throw new Error('fixture_transport_denied:request_size');
  const requestsDir = join(mailbox, 'requests');
  const responsesDir = join(mailbox, 'responses');
  const temporary = join(requestsDir, requestId + '.tmp');
  await writeFile(temporary, body, { flag: 'wx' });
  await rename(temporary, join(requestsDir, requestId + '.json'));
  const deadline = Date.now() + timeout;
  const responsePath = join(responsesDir, requestId + '.json');
  for (;;) {
    if (Date.now() > deadline) throw new Error('Verification fixture transport timed out.');
    try {
      const raw = await readFile(responsePath, 'utf8');
      const response = JSON.parse(raw);
      if (response?.requestId !== requestId || response.schemaVersion !== 1) throw new Error('fixture_transport_corrupt_response');
      if (typeof response.error === 'string') throw new Error('fixture_transport:' + response.error);
      if (typeof response.code !== 'number') throw new Error('fixture_transport_corrupt_response');
      return { code: response.code, stdout: String(response.stdout ?? '').slice(0, OUTPUT_MAX), stderr: String(response.stderr ?? '').slice(0, OUTPUT_MAX) };
    } catch (error) {
      if (error && error.code === 'ENOENT') { await new Promise(resolve => setTimeout(resolve, 50)); continue; }
      throw error;
    }
  }
}
