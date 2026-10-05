import { createHash } from 'node:crypto';
import { canonical } from '../../runner-protocol/index.js';
import type { Job } from '../../runner-protocol/index.js';

/**
 * Composed-attempt descriptor: binds every work unit, interface, package,
 * harness and policy digest to exactly ONE authorized submission attempt.
 * The attempt may fan out to bounded child jobs (one per unit check family
 * plus end-to-end obligations) but consumes exactly one attempt — internal
 * fan-out is never a second submission spend.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const CHECK_ID = /^[a-zA-Z0-9_.-]{1,80}$/;
const UNIT_ID = /^[a-zA-Z0-9_-]{1,80}$/;

/** Fixed adapter → harness mapping. No descriptor may introduce another. */
export const ADAPTER_HARNESS = Object.freeze({
  frontend_component: 'frontend/v1',
  backend_pure_module: 'pure-module/v1',
  backend_api: 'backend-api/v1',
  application_policy: 'application-policy/v1',
} as const);

export type AdapterKind = keyof typeof ADAPTER_HARNESS;

export interface AttemptUnit {
  readonly unitId: string;
  readonly adapterKind: AdapterKind;
  readonly artifactHash: string;
  readonly imageDigest: string;
  readonly checkIds: readonly string[];
}

export interface AttemptInterface {
  readonly interfaceId: string;
  readonly schemaHash: string;
  readonly producerUnitId: string;
  readonly consumerUnitId: string;
}

export interface ChildJob {
  readonly jobId: string;
  readonly scope: 'unit' | 'end_to_end';
  readonly unitId: string;
  readonly harnessId: string;
  readonly artifactHash: string;
  readonly imageDigest: string;
  readonly requiredCheckIds: readonly string[];
}

export class DescriptorRejected extends Error {
  constructor(readonly code: string) { super(`Composed attempt rejected: ${code}.`); }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const AGGREGATE_CHECK_ID = 'attempt.aggregate';

const LIMITS = { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 } as const;

interface ParsedAttempt {
  readonly attemptId: string;
  readonly taskId: string;
  readonly taskVersion: number;
  readonly packageHash: string;
  readonly submissionHash: string;
  readonly jobKind: 'public' | 'private';
  readonly units: readonly AttemptUnit[];
  readonly interfaces: readonly AttemptInterface[];
  readonly endToEndCheckIds: readonly string[];
  readonly policySpecHash: string | null;
  readonly limits: typeof LIMITS;
}

function stringField(value: unknown): string {
  if (typeof value !== 'string') throw new DescriptorRejected('invalid_descriptor');
  return value;
}

function validateInput(input: unknown): ParsedAttempt {
  if (!isObject(input)) throw new DescriptorRejected('invalid_descriptor');
  const attemptId = stringField(input['attemptId']);
  const taskId = stringField(input['taskId']);
  if (!UUID.test(attemptId) || !UUID.test(taskId)) throw new DescriptorRejected('invalid_descriptor');
  const taskVersion = input['taskVersion'];
  if (!Number.isInteger(taskVersion) || (taskVersion as number) < 1) throw new DescriptorRejected('invalid_descriptor');
  const packageHash = stringField(input['packageHash']);
  const submissionHash = stringField(input['submissionHash']);
  if (!HASH.test(packageHash) || !HASH.test(submissionHash)) throw new DescriptorRejected('invalid_descriptor');
  const jobKind = input['jobKind'];
  if (jobKind !== 'public' && jobKind !== 'private') throw new DescriptorRejected('invalid_descriptor');
  if (!Array.isArray(input['units']) || input['units'].length === 0 || input['units'].length > 64) throw new DescriptorRejected('invalid_descriptor');
  if (!Array.isArray(input['interfaces']) || input['interfaces'].length > 128) throw new DescriptorRejected('invalid_descriptor');
  if (!Array.isArray(input['endToEndCheckIds']) || input['endToEndCheckIds'].length > 256 || input['endToEndCheckIds'].some(id => typeof id !== 'string' || !CHECK_ID.test(id))) throw new DescriptorRejected('invalid_descriptor');
  const policySpecHash = input['policySpecHash'];
  if (policySpecHash !== undefined && (typeof policySpecHash !== 'string' || !HASH.test(policySpecHash))) throw new DescriptorRejected('invalid_descriptor');
  const limits = input['limits'];
  if (!isObject(limits) || limits['cpus'] !== LIMITS.cpus || limits['memoryMiB'] !== LIMITS.memoryMiB || limits['pids'] !== LIMITS.pids || limits['seconds'] !== LIMITS.seconds || limits['logBytes'] !== LIMITS.logBytes || limits['writableMiB'] !== LIMITS.writableMiB) throw new DescriptorRejected('invalid_limits');
  const units: AttemptUnit[] = (input['units'] as unknown[]).map(raw => {
    if (!isObject(raw)) throw new DescriptorRejected('invalid_descriptor');
    const unitId = stringField(raw['unitId']);
    if (!UNIT_ID.test(unitId)) throw new DescriptorRejected('invalid_descriptor');
    const adapterKind = raw['adapterKind'];
    if (typeof adapterKind !== 'string' || !(adapterKind in ADAPTER_HARNESS)) throw new DescriptorRejected('unsupported_adapter');
    const artifactHash = stringField(raw['artifactHash']);
    const imageDigest = stringField(raw['imageDigest']);
    if (!HASH.test(artifactHash) || !IMAGE.test(imageDigest)) throw new DescriptorRejected('invalid_descriptor');
    const checkIds = raw['checkIds'];
    if (!Array.isArray(checkIds) || checkIds.length === 0 || checkIds.length > 256 || checkIds.some(id => typeof id !== 'string' || !CHECK_ID.test(id))) throw new DescriptorRejected('invalid_descriptor');
    if (new Set(checkIds).size !== checkIds.length) throw new DescriptorRejected('duplicate_check');
    return Object.freeze({ unitId, adapterKind: adapterKind as AdapterKind, artifactHash, imageDigest, checkIds: Object.freeze([...(checkIds as string[])]) });
  });
  const interfaces: AttemptInterface[] = (input['interfaces'] as unknown[]).map(raw => {
    if (!isObject(raw)) throw new DescriptorRejected('invalid_descriptor');
    const interfaceId = stringField(raw['interfaceId']);
    const producerUnitId = stringField(raw['producerUnitId']);
    const consumerUnitId = stringField(raw['consumerUnitId']);
    if (!UNIT_ID.test(interfaceId) || !UNIT_ID.test(producerUnitId) || !UNIT_ID.test(consumerUnitId)) throw new DescriptorRejected('invalid_descriptor');
    const schemaHash = stringField(raw['schemaHash']);
    if (!HASH.test(schemaHash)) throw new DescriptorRejected('invalid_descriptor');
    return Object.freeze({ interfaceId, schemaHash, producerUnitId, consumerUnitId });
  });
  return { attemptId, taskId, taskVersion: taskVersion as number, packageHash, submissionHash, jobKind, units, interfaces, endToEndCheckIds: input['endToEndCheckIds'] as string[], policySpecHash: (policySpecHash as string | undefined) ?? null, limits: LIMITS };
}

/**
 * Derive the bounded child-job set for one attempt. Each child carries the
 * parent's attempt binding plus its own unit/interface digest scope; every
 * child jobId is deterministically derived so replay yields the same set.
 * The end-to-end job exists only when the task declares e2e obligations.
 */
export function buildAttemptDescriptor(input: unknown) {
  const attempt = validateInput(input);
  const { units, interfaces, endToEndCheckIds } = attempt;
  const unitIds = units.map(unit => unit.unitId);
  if (new Set(unitIds).size !== unitIds.length) throw new DescriptorRejected('duplicate_unit');
  const unitSet = new Set(unitIds);
  for (const item of interfaces) {
    if (!unitSet.has(item.producerUnitId) || !unitSet.has(item.consumerUnitId)) throw new DescriptorRejected('dangling_interface');
  }
  if (endToEndCheckIds.length > 0 && units.length < 2) throw new DescriptorRejected('e2e_without_composition');
  if (units.length > 1 && interfaces.length === 0) throw new DescriptorRejected('composition_without_interfaces');
  const policyUnits = units.filter(unit => unit.adapterKind === 'application_policy');
  if (policyUnits.length > 0 && attempt.policySpecHash === null) throw new DescriptorRejected('missing_policy_spec');
  if (policyUnits.length === 0 && attempt.policySpecHash !== null) throw new DescriptorRejected('unbound_policy_spec');

  const childId = (scope: Record<string, unknown>) => {
    // Deterministic uuid-shaped id: pin version (4) and variant (8) nibbles.
    const hex = createHash('sha256').update(canonical(scope)).digest('hex').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const children: ChildJob[] = units.map(unit => Object.freeze({
    jobId: childId({ attemptId: attempt.attemptId, unitId: unit.unitId, scope: 'unit' }),
    scope: 'unit' as const,
    unitId: unit.unitId,
    harnessId: ADAPTER_HARNESS[unit.adapterKind],
    artifactHash: unit.artifactHash,
    imageDigest: unit.imageDigest,
    requiredCheckIds: unit.checkIds,
  }));
  if (endToEndCheckIds.length > 0) {
    children.push(Object.freeze({
      jobId: childId({ attemptId: attempt.attemptId, scope: 'end_to_end' }),
      scope: 'end_to_end' as const,
      unitId: AGGREGATE_CHECK_ID,
      harnessId: 'composed/v1' as const,
      artifactHash: attempt.packageHash,
      imageDigest: units[0]!.imageDigest,
      requiredCheckIds: Object.freeze([...endToEndCheckIds]),
    }));
  }
  const descriptor = {
    schemaVersion: 1,
    attemptId: attempt.attemptId,
    taskId: attempt.taskId,
    taskVersion: attempt.taskVersion,
    packageHash: attempt.packageHash,
    submissionHash: attempt.submissionHash,
    jobKind: attempt.jobKind,
    units,
    interfaces,
    policySpecHash: attempt.policySpecHash,
    aggregateLimits: attempt.limits,
    children: Object.freeze(children),
    /** One attempt regardless of fan-out width. */
    attemptsConsumed: 1,
  } as const;
  return Object.freeze({
    ...descriptor,
    descriptorDigest: createHash('sha256').update(canonical(descriptor)).digest('hex'),
    assurance: 'bounded' as const,
    realValidation: 'unverified' as const,
    limitations: Object.freeze([
      'A descriptor binds digests to one attempt; it is not execution evidence.',
      'Child jobs run on the dedicated runner only; local derivation proves shape, not containment.',
    ]),
  });
}
