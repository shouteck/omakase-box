import { readFileSync } from 'node:fs';

// `box --version` / `box bounty --version`: the version of the package the
// running file belongs to — the package.json beside the bundle, so the
// kitchen build (packages/box-cli) and the published artifact each report
// their own version.
export const version = (): string =>
  `box ${(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version}`;
