import assert from 'node:assert/strict';
import {compileEvenXOnboardingProjection,verifyEvenXOnboardingProjection} from '../src/projections/even-x-onboarding.mjs';

const good=compileEvenXOnboardingProjection({
  subject_ref:'studio:onboarding:test',
  generation_ref:'g1',
  framework_contract_ref:'xi-io.net:standards/onboarding/even-x-cross-onboarding.v1.json',
  rows:[2,4,6,8,10].map(even=>({even,flat_state:'PASS',x_cross_ref:'cross:'+even,x_state:'PASS',result:'SAME'}))
});
assert.equal(good.eligible_to_continue,true);
assert.equal(verifyEvenXOnboardingProjection(good).state,'PASS');

const wait=compileEvenXOnboardingProjection({
  subject_ref:'studio:onboarding:test',
  generation_ref:'g1',
  framework_contract_ref:'xi-io.net:standards/onboarding/even-x-cross-onboarding.v1.json',
  rows:[
    {even:2,flat_state:'PASS',x_cross_ref:'cross:2',x_state:'PASS',result:'SAME'},
    {even:4,flat_state:'PASS',x_cross_ref:'cross:4',x_state:'DRIFT',result:'DRIFT'}
  ]
});
assert.equal(wait.eligible_to_continue,false);
assert.deepEqual(wait.blocking_evens,[4]);

assert.throws(()=>compileEvenXOnboardingProjection({
  subject_ref:'x',generation_ref:'g1',framework_contract_ref:'f',
  rows:[{even:4,flat_state:'PASS',x_cross_ref:'',x_state:'UNKNOWN',result:'WAIT'}]
}),/X_CROSS_REF_REQUIRED/);

console.log(JSON.stringify({schema:'xiio.sdk.even-x-onboarding-validator/v1',state:'PASS',cases:3,effect_authority:0}));
