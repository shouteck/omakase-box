import { doctor } from './doctor.mjs';

const capabilities = await doctor();
console.log(JSON.stringify({
  schemaVersion: 1,
  assurance: 'unverified',
  software: 'incomplete',
  mandatoryGates: 'unavailable',
  reason: 'Required end-to-end product, isolated-runner, composition and security gates remain incomplete.',
  realIsolatedRunner: capabilities.runner.realValidation,
  livePrivateModel: capabilities.model.liveVerification,
  independentReview: capabilities.independentReview,
  humanPilot: capabilities.humanPilot
}, null, 2));
process.exitCode = 2;
