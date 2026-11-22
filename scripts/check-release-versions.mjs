import { readFile } from 'node:fs/promises';

const expected = JSON.parse(await readFile(new URL('../packages/box-cli/package.json', import.meta.url), 'utf8')).version;
const skills = 'https://raw.githubusercontent.com/shouteck/omakase-skills/HEAD/';

async function read(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

try {
  const [npm, skill, plugin, mcp] = await Promise.all([
    read('https://registry.npmjs.org/omakase-box/latest').then(response => response.json()),
    read(skills + 'skills/omakase-box/SKILL.md').then(response => response.text()),
    read(skills + '.claude-plugin/plugin.json').then(response => response.json()),
    read('https://omakasebox.dev/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'check-release-versions', version: '1.0.0' } }
      })
    }).then(response => response.json())
  ]);
  const versions = {
    npm: npm.version,
    skill: skill.split('---\n')[1]?.match(/^metadata:\n  version: "([^"]+)"$/m)?.[1],
    'skill plugin': plugin.version,
    MCP: mcp.result?.serverInfo?.version
  };
  console.log(`Expected release: ${expected}`);
  for (const [surface, version] of Object.entries(versions)) console.log(`${surface}: ${version ?? 'missing'}`);
  if (Object.values(versions).some(version => version !== expected)) {
    throw new Error('The public release versions do not match the candidate.');
  }
} catch (error) {
  console.error(`Release version check: ${error.message}`);
  process.exitCode = 1;
}
