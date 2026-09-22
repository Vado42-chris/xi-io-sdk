import assert from 'node:assert/strict';
import {compileTwoSidedProviderMeterGate} from '../src/acks/two-sided-provider-meter.mjs';

const base=()=>({
  owner_to_ibal:{open:true,typed_block:null},
  ibal_to_provider:{
    local_available:false,local_substitute_used:false,provider_attempt_requested:true,
    rate_card_state:'ACTIVE',budget_state:'RESERVED',provider_startability:'READY',effect_admission:'PASS'
  },
  provider_to_ibal:{
    provider_result_state:'RESULT',provider_usage_state:'KNOWN',measured_time_ms:250,
    receipt_state:'PRESENT',rate_reconciliation:'PASS',apply_return_requested:true
  }
});

const clean=compileTwoSidedProviderMeterGate(base());
assert.equal(clean.owner_to_ibal.open,true);
assert.equal(clean.ibal_to_provider.provider_attempt_allowed,true);
assert.equal(clean.provider_to_ibal.billing_commit_allowed,true);
assert.equal(clean.provider_to_ibal.apply_return_allowed,true);
assert.equal(clean.owner_relay_required,false);

let ingressRejected=0;
for(let i=0;i<100;i++){
  const x=structuredClone(base());
  x.owner_to_ibal.open=false;
  x.owner_to_ibal.typed_block='WAIT_PROVIDER_OR_ADMISSION';
  const out=compileTwoSidedProviderMeterGate(x);
  assert.equal(out.ibal_to_provider.provider_attempt_allowed,false);
  assert.equal(out.communication_ready,false);
  ingressRejected++;
}
let egressRejected=0;
for(let i=0;i<100;i++){
  const x=structuredClone(base());
  switch(i%5){
    case 0:x.ibal_to_provider.local_available=true;break;
    case 1:x.ibal_to_provider.rate_card_state='MISSING';break;
    case 2:x.ibal_to_provider.budget_state='MISSING';break;
    case 3:x.ibal_to_provider.provider_startability='WAIT';break;
    case 4:x.ibal_to_provider.effect_admission='WAIT';break;
  }
  const out=compileTwoSidedProviderMeterGate(x);
  assert.equal(out.ibal_to_provider.provider_attempt_allowed,false);
  egressRejected++;
}
let returnRejected=0;
for(let i=0;i<100;i++){
  const x=structuredClone(base());
  switch(i%4){
    case 0:x.provider_to_ibal.provider_result_state='WAIT';break;
    case 1:x.provider_to_ibal.provider_usage_state='UNKNOWN';break;
    case 2:x.provider_to_ibal.receipt_state='MISSING';break;
    case 3:x.provider_to_ibal.rate_reconciliation='WAIT';break;
  }
  const out=compileTwoSidedProviderMeterGate(x);
  assert.equal(out.provider_to_ibal.billing_commit_allowed,false);
  assert.equal(out.provider_to_ibal.apply_return_allowed,false);
  returnRejected++;
}
assert.equal(ingressRejected,100);
assert.equal(egressRejected,100);
assert.equal(returnRejected,100);

console.log(JSON.stringify({
  schema:'xiio.sdk.two-sided-provider-meter-check/v1',
  ingress_hostiles:100,
  egress_hostiles:100,
  return_hostiles:100,
  false_green:0,
  result:'PASS',
  effect_authority:0
},null,2));
