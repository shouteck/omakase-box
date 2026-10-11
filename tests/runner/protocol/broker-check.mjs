import { spawnSync } from 'node:child_process';
const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', 'tests/runner/protocol/broker_cases.py'], { stdio: 'inherit', shell: false, windowsHide: true, timeout: 20000 });
if (result.error) console.error('Existing Python 3 runtime unavailable; broker verification is unverified.');
process.exitCode = result.status ?? 2;
