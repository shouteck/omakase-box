import type { SelectionGap } from './selection.js';

// Export never reaches back into the owner repository to fill a hole: when selection is
// impossible it fails with every named preparation gap, each carrying its import chain.
export class PreparationGap extends Error {
  readonly gaps: readonly SelectionGap[];
  constructor(gaps: readonly SelectionGap[]) {
    super(`export impossible: ${gaps.length} preparation gap(s): ${gaps.map(describeGap).join('; ')}`);
    this.name = 'PreparationGap';
    this.gaps = gaps;
  }
}
export class ExportFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportFailed';
  }
}
export class GitFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitFailed';
  }
}
export class SubmissionFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionFailed';
  }
}
export function describeGap(gap: SelectionGap): string {
  const chain = gap.chain.length > 1 ? ` (via ${gap.chain.join(' -> ')})` : '';
  switch (gap.kind) {
    case 'reachable-excluded': return `excluded module ${gap.detail} is reachable from the selection${chain}`;
    case 'undeclared-dependency': return `import of undeclared dependency '${gap.detail}'${chain}`;
    case 'unresolved-import': return `import '${gap.detail}' cannot be resolved${chain}`;
    case 'escapes-root': return `${gap.detail} resolves outside the source root${chain}`;
    case 'missing-editable': return `editable owner file ${gap.detail} does not exist`;
    case 'missing-input': return `selected owner file ${gap.detail} does not exist`;
    case 'duplicate-destination': return `two selected inputs map to the same package path ${gap.detail}${chain}`;
    case 'excluded-input': return `declared input ${gap.detail} is under an excluded prefix`;
    case 'dynamic-import': return `dynamic import in ${gap.detail} cannot be statically resolved${chain}`;
  }
}
