// BT59: the fixture's gh stand-in run inside the test's own process. It is the same source the gh program stand-in runs
// (STANDIN in github-fixture.ts, which hands it here), given a process of its own making: the arguments, the environment, a
// `process.exit` that ends the call, and standard output and error captured. So a test that calls the tool's functions
// directly pays no Node start per GitHub call, and the stand-in's behaviour has one source. Installed through the tool's
// transport seam (`useGitHubTransportForTests` in gh.ts); a test that spawns the built CLI cannot reach it and keeps the
// program.
import { createRequire } from 'node:module';
import type { GitHubTransport } from '../../../packages/box-bounty/gh.js';

class Ended { constructor(readonly code: number) {} }
const load = createRequire(import.meta.url);

export function inProcessGh(source: string): GitHubTransport {
  const script = new Function('require', 'process', 'console', source) as (require: NodeJS.Require, process: unknown, console: unknown) => void;
  return (_root, args) => {
    let stdout = '';
    let stderr = '';
    const own = {
      argv: [process.execPath, 'gh', ...args],
      env: process.env,
      execPath: process.execPath,
      platform: process.platform,
      exit: (code = 0): never => { throw new Ended(code); },
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: (text: string) => { stderr += text; return true; } }
    };
    const ownConsole = {
      log: (...parts: unknown[]) => { stdout += `${parts.map(String).join(' ')}\n`; },
      error: (...parts: unknown[]) => { stderr += `${parts.map(String).join(' ')}\n`; }
    };
    let status = 0;
    try { script(load, own, ownConsole); }
    catch (error) { if (error instanceof Ended) status = error.code; else throw error; }
    return { status, stdout, stderr };
  };
}
