// K59: the limit on one test, by system. The limit is a hang detector, not a speed contract: no wave claims a test
// must finish in 30 s. On the hosted Windows runner many heavy tests take 20 to 35 s (a Git or Node start costs three
// to six times what it does on Linux; runs 43007131911, 42975233441 and 43001061001), and about one run in five
// failed on a single timeout in a different test each time (docs/box-v4/K59-measurements.md). So Windows gets twice
// the limit and Linux and macOS keep 30 s: loosening the systems that are already three times faster would only delay
// the report of a real hang. A test that needs more names its own timeout, as before. No environment override: a
// hidden knob is how a limit drifts.
export const testTimeoutMs = (platform = process.platform) => (platform === 'win32' ? 60000 : 30000);
