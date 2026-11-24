import { readFileSync } from 'node:fs';

// `omakase-box --version`: the version of the package the
// running file belongs to — the package.json beside the bundle, so the
// kitchen build (packages/box-cli) and the published artifact each report
// their own version. BT72: the label every new record stores reads it here too.
export const packageVersion = (): string =>
  (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

export const version = (): string => `omakase-box ${packageVersion()}`;
