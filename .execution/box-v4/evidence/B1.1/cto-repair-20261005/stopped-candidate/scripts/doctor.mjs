import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { probe } from './process.mjs';
import { docker, dockerContext, dockerExecutable } from './docker.mjs';
import { composeArguments, environmentFile } from './synthetic-runtime.mjs';

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
  const databases = { private: 'unverified', external: 'unverified', reason: 'No authenticated synthetic runtime observation is available.' };
  if (dockerCapability.available && existsSync(environmentFile) && !process.argv.includes('--passive')) {
    for (const [scope, service] of [['private', 'private-api'], ['external', 'external-api']]) {
      const prefix = scope.toUpperCase();
      const source = `import { readFileSync } from 'node:fs'; import { Pool } from 'pg'; const prefix = '${prefix}'; const pool = new Pool({ host: process.env[prefix + '_DATABASE_HOST'], database: process.env[prefix + '_DATABASE_NAME'], user: process.env[prefix + '_DATABASE_USER'], password: readFileSync(process.env[prefix + '_DATABASE_PASSWORD_FILE'], 'utf8').trim(), connectionTimeoutMillis: 2000, statement_timeout: 2000 }); try { const row = (await pool.query('SELECT current_database() AS db, current_user AS actor')).rows[0]; console.log(row.db === '${scope}_task' && row.actor === '${scope}_service'); } finally { await pool.end(); }`;
      try {
        const result = await docker([...composeArguments, 'exec', '-T', '--workdir', `/workspace/services/${service}`, service, 'node', '--input-type=module', '-e', source], { timeout: 5000 });
        if (result.code === 0 && result.stdout.trim() === 'true') databases[scope] = 'tested';
      } catch {}
    }
    databases.reason = 'Live own-database identity probes only; separation, cookie policy and owner transactions have distinct verification evidence.';
  }
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
