import { z } from 'zod';
import { HashSchema, IdSchema, RequirementSchema, TextSchema, VersionSchema } from '../common.js';
import { assertDistinctPaths, isEditablePath, PortablePathSchema } from '../paths.js';

export const AdapterKindSchema = z.enum(['frontend_component', 'backend_pure_module', 'backend_api', 'application_policy']);
export const CapabilitySchema = z.enum(['browser', 'static_assets', 'job_proxy', 'restricted_process', 'candidate_api', 'data_only_policy']);
export const ADAPTER_REGISTRY = {
  frontend_component: { version: 1, required: ['browser', 'static_assets'], allowed: ['browser', 'static_assets', 'job_proxy'] },
  backend_pure_module: { version: 1, required: ['restricted_process'], allowed: ['restricted_process'] },
  backend_api: { version: 1, required: ['candidate_api', 'job_proxy'], allowed: ['candidate_api', 'job_proxy'] },
  application_policy: { version: 1, required: ['data_only_policy'], allowed: ['data_only_policy'] }
} as const;
export const WorkUnitSchema = z.strictObject({
  id: IdSchema,
  adapterKind: AdapterKindSchema,
  adapterVersion: z.literal(1),
  requirementIds: z.array(IdSchema).min(1).max(256),
  editablePaths: z.array(PortablePathSchema.refine(isEditablePath, 'Evaluator/tooling paths are not editable.')).min(1).max(128),
  interfaceIds: z.array(IdSchema).max(128),
  trustedCheckIds: z.array(IdSchema).min(1).max(256),
  requiredCapabilities: z.array(CapabilitySchema).min(1).max(6),
  startAfterUnitIds: z.array(IdSchema).max(64)
}).superRefine((unit, context) => {
  const registration = ADAPTER_REGISTRY[unit.adapterKind];
  const allowed: readonly string[] = registration.allowed;
  if (unit.requiredCapabilities.some(value => !allowed.includes(value)) || registration.required.some(value => !unit.requiredCapabilities.includes(value))) context.addIssue({ code: 'custom', message: 'Unsupported or missing adapter capabilities.' });
  for (const values of [unit.requirementIds, unit.interfaceIds, unit.trustedCheckIds, unit.requiredCapabilities, unit.startAfterUnitIds]) if (new Set(values).size !== values.length) context.addIssue({ code: 'custom', message: 'Duplicate unit links or capabilities.' });
  if (unit.adapterKind === 'application_policy' && unit.editablePaths.some(path => !/^config\/[A-Za-z0-9_-]+\.json$/.test(path))) context.addIssue({ code: 'custom', message: 'Policy units edit only approved data-only application JSON.' });
  try { assertDistinctPaths(unit.editablePaths); } catch { context.addIssue({ code: 'custom', message: 'Colliding editable paths.' }); }
});
export const PublicInterfaceSchema = z.strictObject({
  id: IdSchema,
  producerUnitIds: z.array(IdSchema).min(1).max(64),
  consumerUnitIds: z.array(IdSchema).min(1).max(64),
  schema: z.strictObject({ id: IdSchema, version: VersionSchema, path: PortablePathSchema, sha256: HashSchema }),
  semantics: z.enum(['request_response', 'file', 'callback']),
  requestSemantics: TextSchema,
  responseSemantics: TextSchema,
  errorStates: z.array(TextSchema).max(64),
  ownerUnitId: IdSchema,
  compatibilityRequirementIds: z.array(IdSchema).min(1).max(256)
});
export const PublicCheckSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['unit', 'interface', 'end_to_end']),
  requirementIds: z.array(IdSchema).min(1).max(256),
  workUnitIds: z.array(IdSchema).min(1).max(64),
  interfaceIds: z.array(IdSchema).max(128)
});
export type WorkUnit = z.infer<typeof WorkUnitSchema>;
export type PublicInterface = z.infer<typeof PublicInterfaceSchema>;
export const CompositionShape = {
  disciplines: z.array(IdSchema).min(1).max(32),
  workUnits: z.array(WorkUnitSchema).min(1).max(64),
  interfaces: z.array(PublicInterfaceSchema).max(128),
  requirements: z.array(RequirementSchema).min(1).max(256),
  endToEndRequirements: z.array(RequirementSchema).max(256),
  publicChecks: z.array(PublicCheckSchema).min(1).max(512),
  editablePaths: z.array(PortablePathSchema).min(1).max(512)
};
export type Composition = z.infer<z.ZodObject<typeof CompositionShape>>;
export function validateComposition(task: Composition, context: z.RefinementCtx): void {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  const ids = new Set(task.workUnits.map(unit => unit.id));
  const interfaces = new Set(task.interfaces.map(item => item.id));
  const checks = new Map(task.publicChecks.map(check => [check.id, check]));
  const requirements = new Set([...task.requirements, ...task.endToEndRequirements].map(requirement => requirement.id));
  if (!unique(task.disciplines) || ids.size !== task.workUnits.length || interfaces.size !== task.interfaces.length || checks.size !== task.publicChecks.length || requirements.size !== task.requirements.length + task.endToEndRequirements.length) issue('Duplicate composition IDs.');
  const paths = task.workUnits.flatMap(unit => unit.editablePaths);
  try { assertDistinctPaths(paths); assertDistinctPaths(task.editablePaths); } catch { issue('Conflicting path ownership.'); }
  if (paths.length !== task.editablePaths.length || paths.some(path => !task.editablePaths.includes(path))) issue('Editable path union mismatch.');
  for (const unit of task.workUnits) {
    if (unit.requirementIds.some(id => !requirements.has(id)) || unit.interfaceIds.some(id => !interfaces.has(id)) || unit.trustedCheckIds.some(id => !checks.has(id)) || unit.startAfterUnitIds.some(id => !ids.has(id))) issue('Dangling work-unit link.');
    if (unit.trustedCheckIds.some(id => !checks.get(id)?.workUnitIds.includes(unit.id))) issue('Check does not cover its linked work unit.');
    if (unit.interfaceIds.some(id => { const item = task.interfaces.find(value => value.id === id); return item && ![...item.producerUnitIds, ...item.consumerUnitIds].includes(unit.id); })) issue('Work unit declares an interface without participation.');
    for (const requirementId of unit.requirementIds) if (!unit.trustedCheckIds.some(id => checks.get(id)?.requirementIds.includes(requirementId))) issue('Work-unit requirement has no linked trusted check.');
  }
  const schemaOwners = new Map<string, string>();
  const schemaDefinitions = new Map<string, string>();
  for (const item of task.interfaces) {
    const participants = [...item.producerUnitIds, ...item.consumerUnitIds];
    if (!unique(item.producerUnitIds) || !unique(item.consumerUnitIds) || participants.some(id => !ids.has(id)) || !participants.includes(item.ownerUnitId) || item.compatibilityRequirementIds.some(id => !requirements.has(id))) issue('Dangling interface link or ownership.');
    const definition = JSON.stringify({ ...item.schema, ownerUnitId: item.ownerUnitId });
    for (const key of ['path:' + item.schema.path.toLowerCase(), 'id:' + item.schema.id]) {
      if (schemaDefinitions.has(key) && schemaDefinitions.get(key) !== definition) issue('Conflicting schema definition, version or ownership.');
      schemaDefinitions.set(key, definition);
    }
    if (schemaOwners.has(item.schema.path.toLowerCase()) && schemaOwners.get(item.schema.path.toLowerCase()) !== item.ownerUnitId) issue('Conflicting schema ownership.');
    schemaOwners.set(item.schema.path.toLowerCase(), item.ownerUnitId);
    if (paths.some(path => path.toLowerCase() === item.schema.path.toLowerCase())) issue('Trusted interface schemas are not candidate-editable.');
    if (!unique(item.compatibilityRequirementIds)) issue('Duplicate compatibility requirement.');
    if (participants.some(id => !task.workUnits.find(unit => unit.id === id)?.interfaceIds.includes(item.id))) issue('Interface participants must declare the interface.');
    if (!task.publicChecks.some(check => check.kind === 'interface' && check.interfaceIds.includes(item.id) && item.compatibilityRequirementIds.every(id => check.requirementIds.includes(id)))) issue('Interface compatibility has no trusted check.');
  }
  for (const check of task.publicChecks) if (!unique(check.requirementIds) || !unique(check.workUnitIds) || !unique(check.interfaceIds) || check.requirementIds.some(id => !requirements.has(id)) || check.workUnitIds.some(id => !ids.has(id)) || check.interfaceIds.some(id => !interfaces.has(id))) issue('Dangling or duplicate check link.');
  for (const requirement of [...task.requirements, ...task.endToEndRequirements]) if (!task.publicChecks.some(check => check.requirementIds.includes(requirement.id))) issue('Requirement has no trusted check.');
  if (task.workUnits.length > 1 && (!task.interfaces.length || !task.endToEndRequirements.length)) issue('Composed outcomes require interfaces and end-to-end obligations.');
  for (const requirement of task.endToEndRequirements) if (!task.publicChecks.some(check => check.kind === 'end_to_end' && check.requirementIds.includes(requirement.id) && task.workUnits.every(unit => check.workUnitIds.includes(unit.id)))) issue('End-to-end requirement lacks whole-task coverage.');
  if (task.workUnits.length > 1) {
    const connected = new Set<string>();
    const queue = [task.workUnits[0]!.id];
    while (queue.length) {
      const id = queue.pop()!;
      if (connected.has(id)) continue;
      connected.add(id);
      for (const item of task.interfaces) {
        const participants = [...item.producerUnitIds, ...item.consumerUnitIds];
        if (participants.includes(id)) queue.push(...participants.filter(value => !connected.has(value)));
      }
    }
    if ([...ids].some(id => !connected.has(id))) issue('Composed work units must be connected by published interfaces.');
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    if (task.workUnits.find(unit => unit.id === id)?.startAfterUnitIds.some(dependency => !visit(dependency))) return false;
    visiting.delete(id); visited.add(id); return true;
  }
  if (task.workUnits.some(unit => !visit(unit.id))) issue('Cyclic start dependencies.');
}
