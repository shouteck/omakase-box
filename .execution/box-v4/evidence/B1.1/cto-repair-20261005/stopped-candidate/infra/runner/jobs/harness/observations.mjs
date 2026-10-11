/**
 * Shared trusted-observation vocabulary for the guest supervisor and the
 * private-side importer. Observations are facts the supervisor itself
 * measured (channel bytes, exit status, cgroup counters, wall clock) — never
 * anything the candidate asserted.
 */
export const OBSERVATION_KIND = Object.freeze({
  check: 'check',
  process: 'process',
  channel: 'channel',
  containment: 'containment',
});

export const CHECK_OUTCOME = Object.freeze({
  passed: 'passed',
  failed: 'failed',
  unverified: 'unverified',
});

/** Containment counters the supervisor reads from cgroup v2 and the channel. */
export function emptyContainment() {
  return {
    kind: OBSERVATION_KIND.containment,
    peakMemoryBytes: 0,
    oomKilled: false,
    oomKillCount: 0,
    pidsPeak: 0,
    pidTripped: false,
    channelBytesRead: 0,
    channelBytesWritten: 0,
    channelCorrupt: false,
    outputFlooded: false,
    writableEnforcedBytes: 0,
    writableBytesUsed: null,
    writableExceeded: false,
    timedOut: false,
    egressSuspected: false,
  };
}

/**
 * The supervisor's authoritative lifecycle record for one spawned span.
 * exitCode/signal come from waitpid, not from anything the candidate printed.
 */
export function processObservation(spanId) {
  return {
    kind: OBSERVATION_KIND.process,
    spanId,
    exitCode: null,
    signal: null,
    wallMs: null,
    timedOut: false,
    flooded: false,
    killed: false,
  };
}
