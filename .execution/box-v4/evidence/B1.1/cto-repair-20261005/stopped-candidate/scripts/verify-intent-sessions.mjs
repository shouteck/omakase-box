import assert from 'node:assert/strict';
import { docker } from './docker.mjs';
import { composeArguments } from './synthetic-runtime.mjs';

const result = await docker([...composeArguments,'exec','-T','--env','SYNTHETIC_INTENT_FIXTURE=private-task-mvp-synthetic','--workdir','/workspace/services/private-api','private-api','node','dist/session-fixture.js'],{timeout:60000});
assert.equal(result.code,0,'Synthetic intent session verification failed.');
const report=JSON.parse(result.stdout);
assert.equal(report.assurance,'tested');assert.equal(report.realCustomerData,false);
console.log(JSON.stringify(report));
