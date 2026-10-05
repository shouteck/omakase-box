import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { probe } from './process.mjs';
import { dockerContext, dockerExecutable } from './docker.mjs';

async function runnerReport() {
  const unavailable = reason => ({ assurance: 'unverified', requiredProfile: 'dedicated-linux-kvm-fresh-vm', status: 'needs_configuration', realValidation: 'unverified', hostExecutionAllowed: false, reason });
  let input;
  if (process.env.RUNNER_CONFIG_FILE) {
    try {
      const metadata = await stat(process.env.RUNNER_CONFIG_FILE);
      if (!metadata.isFile() || metadata.size > 65536) return unavailable('invalid_configuration');
      input = JSON.parse(await readFile(process.env.RUNNER_CONFIG_FILE, 'utf8'));
    } catch { return unavailable('invalid_configuration'); }
  }
  try {
    const module = await import('../services/runner-controller/dist/index.js');
    const capability = module.runnerCapability(input);
    return {
      assurance: 'unverified', requiredProfile: 'dedicated-linux-kvm-fresh-vm',
      status: capability.status === 'configured_not_validated' ? 'configured_not_validated' : 'needs_configuration',
      realValidation: 'unverified', hostExecutionAllowed: false
    };
  } catch { return unavailable('controller_not_built'); }
}

export async function doctor() {
  const dockerCapability = await probe(dockerExecutable(), ['--context', dockerContext, 'version', '--format', '{{.Server.Version}}']);
  const databases = { private: 'unverified', external: 'unverified', reason: 'No authenticated runtime observation is available; the synthetic container stack was removed in K3.' };
  const hosts = await Promise.all(['private.localhost', 'contributor.localhost'].map(async hostname => {
    try {
      const records = await Promise.race([lookup(hostname, { all: true }), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))]);
      return { hostname, status: records.length > 0 && records.every(record => ['127.0.0.1', '::1'].includes(record.address)) ? 'tested' : 'unverified' };
    } catch { return { hostname, status: 'unverified' }; }
  }));
  const nodeSupported = Number(process.versions.node.split('.')[0]) === 24 && Number(process.versions.node.split('.')[1]) >= 11;
  return {
    schemaVersion: 1,
    assurance: 'tested',
    node: { version: process.versions.node, supported: nodeSupported, pinned: '24.11.0' },
    pnpm: { pinned: '10.34.5', localInstalled: existsSync(fileURLToPath(new URL('./tooling/node_modules/pnpm/bin/pnpm.cjs', import.meta.url))) },
    docker: { status: dockerCapability.available ? 'tested' : 'unverified', daemonAvailable: dockerCapability.available, reason: dockerCapability.available ? null : dockerCapability.reason ?? 'daemon_unavailable' },
    databases,
    browserHosts: hosts,
    model: { mode: 'not_configured', status: 'needs_configuration', liveVerification: 'unverified' },
    runner: await runnerReport(),
    independentReview: 'unverified',
    humanPilot: 'not_conducted'
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await doctor();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.node.supported ? 0 : 2;
}
