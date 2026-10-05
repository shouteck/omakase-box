import type { KeyObject } from 'node:crypto';
import { canonicalize } from '../contracts/hash.js';
import { compileApprovedRelease } from './index.js';
import { verifyVettedWorkspace } from './workspace.js';
import { PUBLIC_IMAGE_PROFILE } from '../../templates/workspaces/public-image-profile.js';

export function compileApprovedWorkspace(input: unknown, verificationKey: KeyObject | string | Buffer) {
  try {
    const release = JSON.parse(canonicalize(input)) as { contract?: { imageDigest?: unknown }; assets?: unknown };
    if (release.contract?.imageDigest !== PUBLIC_IMAGE_PROFILE.imageDigest || verifyVettedWorkspace(release.contract, release.assets).status !== 'checked') throw new Error('invalid_approved_workspace');
    return compileApprovedRelease(input, verificationKey);
  } catch { throw new Error('invalid_approved_workspace'); }
}
