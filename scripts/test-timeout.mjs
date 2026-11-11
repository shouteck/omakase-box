// K59: the limit on one test, by system. The limit is a hang detector, not a speed contract: no wave claims a test
// must finish in 30 s. On the hosted Windows runner many heavy tests take 20 to 35 s (a Git or Node start costs three
// to six times what it does on Linux; runs 43007131911, 42975233441 and 43001061001), and about one run in five
// failed on a single timeout in a different test each time (docs/box-v4/K59-measurements.md). So Windows gets twice
// the limit and Linux and macOS keep 30 s: loosening the systems that are already three times faster would only delay
// the report of a real hang. A test that needs more names its own timeout, as before. No environment override: a
// hidden knob is how a limit drifts.
export const testTimeoutMs = (platform = process.platform) => (platform === 'win32' ? 60000 : 30000);

// K60: the same rule for a setup hook (a beforeAll or beforeEach that builds a fixture). K59 raised the limit on a test and
// left Vitest's hook limit at its 10 s default; on run 43024146368 (master, the K59 merge commit) the Windows job failed
// with "Hook timed out in 10000ms" in bt8c and pf26. A fixture is Git and Node starts, which cost three to six times as
// much on Windows, so Windows gets three times the limit and the other systems keep 10 s. No environment override.
export const hookTimeoutMs = (platform = process.platform) => (platform === 'win32' ? 30000 : 10000);
