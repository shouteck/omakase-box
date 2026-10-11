import { isPortablePath } from '../../contracts/paths.js';

/**
 * Template-specific patch mapping (M7.1). The public workspace template
 * assigns every editable path to exactly one work unit; a patch path that
 * maps to no unit is contributor fault (non-editable content), never a
 * package defect. Mapping is pure data over the contract-bound unit set.
 */

export class MappingRejected extends Error {
  constructor(readonly code: string) { super(`Patch mapping rejected: ${code}.`); }
}

export interface TemplateUnit {
  readonly unitId: string;
  readonly editablePaths: readonly string[];
}

export interface PatchMapping {
  /** unitId → sorted patch paths owned by that unit. */
  readonly units: Readonly<Record<string, readonly string[]>>;
  /** Sorted patch paths that belong to no declared unit. */
  readonly unmappedPaths: readonly string[];
}

/** Map each patch path to its owning unit. Unmapped paths are reported, not thrown. */
export function mapPatchToUnits(units: readonly TemplateUnit[], patchPaths: readonly string[]): PatchMapping {
  if (!Array.isArray(units) || units.length === 0 || units.length > 64) throw new MappingRejected('invalid_units');
  const owners = new Map<string, string>();
  for (const unit of units) {
    if (typeof unit.unitId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(unit.unitId)) throw new MappingRejected('invalid_units');
    if (!Array.isArray(unit.editablePaths)) throw new MappingRejected('invalid_units');
    for (const path of unit.editablePaths) {
      if (!isPortablePath(path)) throw new MappingRejected('invalid_units');
      const key = path.toLowerCase();
      if (owners.has(key)) throw new MappingRejected('path_ownership_conflict');
      owners.set(key, unit.unitId);
    }
  }
  if (patchPaths.length > 512) throw new MappingRejected('patch_unbounded');
  const mapped = new Map<string, string[]>();
  const unmapped: string[] = [];
  for (const path of patchPaths) {
    if (typeof path !== 'string' || !isPortablePath(path)) throw new MappingRejected('invalid_path');
    const owner = owners.get(path.toLowerCase());
    if (owner === undefined) { unmapped.push(path); continue; }
    (mapped.get(owner) ?? mapped.set(owner, []).get(owner)!).push(path);
  }
  const byUnit: Record<string, readonly string[]> = {};
  for (const [unitId, paths] of [...mapped.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    byUnit[unitId] = Object.freeze([...new Set(paths)].sort());
  }
  return Object.freeze({ units: Object.freeze(byUnit), unmappedPaths: Object.freeze([...new Set(unmapped)].sort()) });
}
