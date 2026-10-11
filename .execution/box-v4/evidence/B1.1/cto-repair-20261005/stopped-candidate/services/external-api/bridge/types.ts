export const BRIDGE_REJECTION_CODES = ['invalid_context', 'invalid_envelope', 'invalid_signature', 'invalid_approval', 'invalid_manifest', 'invalid_contract', 'expired', 'replay', 'package_mismatch', 'asset_mismatch', 'package_integrity', 'task_conflict', 'persistence_unavailable', 'record_invalid', 'not_published'] as const;

export type BridgeRejectionCode = typeof BRIDGE_REJECTION_CODES[number];

/**
 * Fixed safe boundary error: only the code is exposed; no packet, manifest,
 * asset or persistence detail is ever attached to the message or the object.
 */
export class BridgeRejected extends Error {
  readonly code: BridgeRejectionCode;
  constructor(code: BridgeRejectionCode) {
    if (!BRIDGE_REJECTION_CODES.some(candidate => candidate === code)) throw new Error(filename());
    super(code);
    const descriptor = { value: 'BridgeRejected', enumerable: false, writable: false, configurable: true };
    Object.defineProperty(this, 'name', descriptor);
    this.code = code;
  }
}

function filename(): string {
  return 'unknown_bridge_rejection_code';
}
