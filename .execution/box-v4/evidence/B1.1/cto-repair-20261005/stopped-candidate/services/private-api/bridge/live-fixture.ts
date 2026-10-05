import { buildSignedReleaseTransport } from './release.js';

/**
 * Container-side packet fixture: turns an approved release set plus runtime
 * signing keys into the exact signed bridge transport without any private
 * provenance. The synthetic runtime mounts this runtime-controlled key set
 * (PRIVATE_* or test-provided) and never prints key material.
 */
export interface BridgePacketFixtureKeys {
  releaseVerificationKeyPem: string;
  bridgeSigningKeyPem: string;
}

export async function runBridgePacketFixture(input: {
  keys: BridgePacketFixtureKeys;
  release: unknown;
  transport: { eventId: string; nonce: string; ttlSeconds?: number };
}): Promise<{ packet: unknown; packageBytesBase64: string; sha256: string; manifestHash: string }> {
  const { createPublicKey, createPrivateKey } = await import('node:crypto');
  const output = buildSignedReleaseTransport({
    release: input.release,
    transport: input.transport,
    verificationKey: createPublicKey(input.keys.releaseVerificationKeyPem),
    bridgeSigningKey: createPrivateKey(input.keys.bridgeSigningKeyPem)
  });
  return { packet: output.packet, packageBytesBase64: Buffer.from(output.packageBytes).toString('base64'), sha256: output.sha256, manifestHash: output.manifestHash };
}
