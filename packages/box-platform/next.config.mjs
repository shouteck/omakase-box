import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { writeVersion } from './version.mjs';

/** Static export: the prototype is plain files, served by scripts/serve.mjs. */
export default phase => {
  if (phase === PHASE_PRODUCTION_BUILD) writeVersion(new URL('./', import.meta.url));
  return {
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
    poweredByHeader: false,
  };
};
