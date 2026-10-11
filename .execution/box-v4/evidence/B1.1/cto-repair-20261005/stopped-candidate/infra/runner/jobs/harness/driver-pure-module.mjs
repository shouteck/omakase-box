/**
 * Trusted pure-module/v1 check driver. Runs inside the supervisor context —
 * NEVER inside the candidate container. It exchanges bounded records with the
 * worker shim over the shim's stdio: the shim can only return raw call
 * outputs or errors, and every verdict below is computed exclusively from
 * the sealed check contract plus the actual observed response. A worker that
 * prints "passed", exits 0, monkeypatches its own assertions or stays silent
 * cannot produce a passing outcome here.
 */
import { CHECK_OUTCOME, OBSERVATION_KIND } from './observations.mjs';

export class DriverRejected extends Error {
  constructor(code) {
    super(code);
    this.name = 'DriverRejected';
    this.code = code;
  }
}

const MAX_VALUE_DEPTH = 24;
const MAX_VALUE_NODES = 4096;

/**
 * Deep structural equality over JSON-shaped values with explicit depth/node
 * bounds — a pathological nested response cannot exhaust the evaluator.
 */
export function canonicalEqual(expected, actual, budget = { nodes: 0 }) {
  budget.nodes += 1;
  if (budget.nodes > MAX_VALUE_NODES) throw new DriverRejected('value_too_large');
  if (expected === actual) return true;
  if (typeof expected !== typeof actual || expected === null || actual === null) return false;
  if (typeof expected !== 'object') return false;
  if (Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) return false;
    return expected.every((value, index) => canonicalEqual(value, actual[index], budget));
  }
  const keys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  if (keys.length !== actualKeys.length) return false;
  return keys.every(key => Object.hasOwn(actual, key) && canonicalEqual(expected[key], actual[key], budget));
}

function safeValue(value, depth = 0) {
  if (depth > MAX_VALUE_DEPTH) throw new DriverRejected('value_too_large');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(item => safeValue(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeValue(item, depth + 1)]));
  throw new DriverRejected('invalid_value');
}

/** One request the driver will put on the worker channel. */
export function planCheckRequest(check) {
  return Object.freeze({ type: 'call', checkId: check.checkId, exportName: check.exportName, arguments: check.arguments });
}

/**
 * Resolve one check outcome purely from (a) the sealed expectation and
 * (b) what the supervisor actually observed from the channel. `response` is
 * the raw worker frame or null when the channel produced nothing usable.
 * `process` is the supervisor's authoritative lifecycle observation for the
 * span covering this check.
 */
export function evaluateCheck(check, response, processObservation) {
  const observation = {
    checkId: check.checkId,
    kind: OBSERVATION_KIND.check,
    wallMs: processObservation?.wallMs ?? null,
    exitCode: processObservation?.exitCode ?? null,
    signal: processObservation?.signal ?? null,
  };
  if (processObservation?.timedOut === true || processObservation?.flooded === true || processObservation?.killed === true) {
    return Object.freeze({ checkId: check.checkId, outcome: CHECK_OUTCOME.failed, observation: { ...observation, reason: 'containment_trip' } });
  }
  if (response === null) {
    return Object.freeze({ checkId: check.checkId, outcome: CHECK_OUTCOME.unverified, observation: { ...observation, reason: 'no_response' } });
  }
  if (response.checkId !== check.checkId) {
    return Object.freeze({ checkId: check.checkId, outcome: CHECK_OUTCOME.unverified, observation: { ...observation, reason: 'channel_mismatch' } });
  }
  if (response.type === 'error') {
    return Object.freeze({ checkId: check.checkId, outcome: CHECK_OUTCOME.failed, observation: { ...observation, reason: 'candidate_error' } });
  }
  let value;
  try { value = safeValue(response.value); } catch {
    return Object.freeze({ checkId: check.checkId, outcome: CHECK_OUTCOME.unverified, observation: { ...observation, reason: 'unsafe_value' } });
  }
  let equal;
  try { equal = canonicalEqual(check.expected, value); } catch {
    return Object.freeze({ checkId: check.checkId, outcome: CHECK_OUTCOME.unverified, observation: { ...observation, reason: 'unsafe_value' } });
  }
  return Object.freeze({ checkId: check.checkId, outcome: equal ? CHECK_OUTCOME.passed : CHECK_OUTCOME.failed, observation: { ...observation, reason: equal ? 'output_match' : 'output_mismatch' } });
}

/**
 * Job-level outcome: passed requires every required check passed with no
 * containment breach. Any failed check → failed. Any unknown/unverified
 * evidence → unverified, which is never treated as passing upstream.
 */
export function summarizeJob(evaluated, containment) {
  const breach = containment.oomKilled || containment.pidTripped || containment.outputFlooded || containment.channelCorrupt || containment.writableExceeded || containment.timedOut || containment.egressSuspected;
  if (breach) return 'failed';
  if (evaluated.some(entry => entry.outcome === CHECK_OUTCOME.failed)) return 'failed';
  if (evaluated.some(entry => entry.outcome !== CHECK_OUTCOME.passed)) return 'unverified';
  return 'passed';
}
