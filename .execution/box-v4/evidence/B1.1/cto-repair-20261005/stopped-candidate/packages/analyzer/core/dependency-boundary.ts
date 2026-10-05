import { ANALYSIS_ASSURANCE, ANALYSIS_DISCLAIMER, buildBoundarySurface, classifyEvidence } from './boundary-surface.js';
import type { BoundarySurface, ModuleVerdict, SurfaceRequest } from './boundary-surface.js';

/** Dependency-boundary report: the advisory classification facade used by the
 * security suite and later compiler/evaluation gates. It re-uses the read-only,
 * hash-verified boundary surface and never elevates findings into authority. */

export type {
  BoundaryEvidence,
  BoundarySurface,
  ClassifiedImport,
  EvidenceTarget,
  Finding,
  ImportBoundary,
  ImportClassification,
  ImportVia,
  ModuleVerdict,
  ModuleVerdictLabel,
  SurfaceEditClosure,
  SurfaceImportClosures,
  SurfaceRequest,
  VerdictReason
} from './boundary-surface.js';

export { classifyEvidence } from './boundary-surface.js';

export interface DependencyBoundaryReport {
  readonly assurance: typeof ANALYSIS_ASSURANCE;
  readonly limits: readonly string[];
  readonly disclaimer: string;
  readonly verdicts: readonly ModuleVerdict[];
  readonly rejected: readonly ModuleVerdict[];
  readonly unsupported: readonly ModuleVerdict[];
  readonly unknown: readonly ModuleVerdict[];
}

export async function analyzeDependencyBoundary(request: SurfaceRequest): Promise<DependencyBoundaryReport> {
  const surface = await buildBoundarySurface(request);
  return {
    assurance: ANALYSIS_ASSURANCE,
    limits: surface.limits,
    disclaimer: ANALYSIS_DISCLAIMER,
    verdicts: surface.verdicts,
    rejected: surface.verdicts.filter(item => item.verdict === 'rejected'),
    unsupported: surface.verdicts.filter(item => item.verdict === 'unsupported'),
    unknown: surface.verdicts.filter(item => item.verdict === 'unknown')
  };
}

export type { BoundarySurface as AnalyzerSurface };
