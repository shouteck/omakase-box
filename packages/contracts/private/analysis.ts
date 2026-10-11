import { z } from 'zod';
import { HashSchema, TextSchema } from '../common.js';
import { isPortablePath } from '../paths.js';

/** Static analysis proposal contracts (M3.1). Reports are untrusted advisory data
 * over captured snapshot bytes: they never authorize release, execution, transfer
 * or any privileged action, and they contain only paths/syntactic kinds, never
 * analyzed source text, private logs, canaries or credentials. */

export const AnalyzerUnitSchema = z.strictObject({
  unitId: TextSchema,
  adapterKind: z.enum(['frontend_component', 'backend_pure_module', 'backend_api', 'application_policy']),
  paths: z.array(z.string()).max(64),
  carriesState: z.array(z.string().max(256)).max(64)
});
export type AnalyzerUnit = z.infer<typeof AnalyzerUnitSchema>;

const RawFindingSchema = z.strictObject({
  kind: z.string().max(64),
  module: z.string().max(240),
  classification: z.enum(['rejected', 'unknown']),
  detail: z.string().max(512),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional()
});
export const AnalysisFindingSchema = RawFindingSchema.readonly();
export type AnalysisFinding = z.infer<typeof AnalysisFindingSchema>;

export const ModuleReportSchema = z.strictObject({
  path: z.string().max(240),
  role: z.enum(['public', 'protected', 'context']),
  ownerUnit: TextSchema.nullable(),
  exportedSymbols: z.array(z.string().max(128)).max(256),
  exportedMutableBindings: z.array(z.string().max(128)).max(256),
  stateDependencies: z.array(z.string().max(256)).max(256),
  dependencies: z.array(z.string().max(240)).max(256),
  dependencyPackages: z.array(z.string().max(128)).max(256),
  classification: z.enum(['rejected', 'unknown', 'provisionally_supported']),
  requiresRuntimeVerification: z.literal(true)
});
export type ModuleReport = z.infer<typeof ModuleReportSchema>;

export const ImportEdgeSchema = z.strictObject({
  from: z.string().max(240),
  specifier: z.string().max(256),
  to: z.string().max(240).nullable(),
  kind: z.enum(['value', 'type', 'dynamic', 'require'])
});
export type ImportEdge = z.infer<typeof ImportEdgeSchema>;

export const BoundaryReportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  assurance: z.literal('bounded'),
  snapshotHash: HashSchema.nullable(),
  sourceDigest: HashSchema,
  statement: TextSchema,
  assumptions: z.array(z.string().max(1024)).min(1).max(64),
  limits: z.array(z.string().max(1024)).min(1).max(64),
  runtimeVerificationRequired: z.literal(true),
  independentReviewRequired: z.literal(true),
  modules: z.array(ModuleReportSchema).max(256),
  importClosure: z.array(ImportEdgeSchema).max(8192),
  findings: z.array(AnalysisFindingSchema).max(2048),
  verdict: z.enum(['rejected', 'unknown', 'provisionally_supported'])
});
export type BoundaryReport = z.infer<typeof BoundaryReportSchema>;

export function validateReportInput(candidate: AnalyzerUnit | undefined, publicSurface: readonly string[], protectedModules: readonly string[]): void {
  for (const path of [...publicSurface, ...protectedModules]) if (!isPortablePath(path)) throw new Error('analyzer_invalid_input');
  if (candidate) for (const unit of [candidate]) for (const path of unit.paths) if (!isPortablePath(path)) throw new Error('analyzer_invalid_input');
}
