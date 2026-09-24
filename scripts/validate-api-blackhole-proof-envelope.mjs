#!/usr/bin/env node
import assert from 'node:assert/strict';
import {evaluateApiBlackholeClaim} from '../src/evaluation/api-blackhole-proof-envelope.mjs';

const base={
  source_generation:'g-current',
  expected_host_ref:'aries',
  expected_execution_surface_ref:'aries:user-session',
  allowed_target_prefixes:['/home/chrishallberg/.local/share/xi-io'],
};

const validReceipt={
  host_ref:'aries',
  execution_surface_ref:'aries:user-session',
  environment_survey_ref:'survey:aries:g-current',
  environment_current:true,
  generation_ref:'g-current',
  producer_ref:'runtime:aries',
  verifier_ref:'readback:independent',
  fresh:true,
  replayed:false,
  independent_readback:true,
  authenticated:true,
};

const cases=[
  {
    id:'PROSE_STAYS_CONTAINED',
    input:{...base,claim_kind:'PROSE',proof_scope:'HOME_CURRENT'},
    state:'TRUE_WAIT',first_red:'NATIVE_RUNTIME_RECEIPT_REQUIRED'
  },
  {
    id:'LOCALHOST_TEXT_STAYS_CONTAINED',
    input:{...base,claim_kind:'LOCALHOST_TEXT',proof_scope:'SYNTHETIC_FIXTURE'},
    state:'TRUE_WAIT',first_red:'NATIVE_RUNTIME_RECEIPT_REQUIRED'
  },
  {
    id:'ZED_TOOL_SHAPE_OUT_OF_SCOPE',
    input:{...base,claim_kind:'TOOL_CALL_TEXT',proof_scope:'HOME_CURRENT',target_path:'/a/b/backend/src/main.rs'},
    state:'FAIL',first_red:'OUT_OF_SCOPE_TARGET'
  },
  {
    id:'PATH_TRAVERSAL_CANNOT_ESCAPE_SCOPE',
    input:{...base,claim_kind:'TOOL_CALL_TEXT',proof_scope:'HOME_CURRENT',target_path:'/home/chrishallberg/.local/share/xi-io/../../../../etc/passwd'},
    state:'FAIL',first_red:'OUT_OF_SCOPE_TARGET'
  },
  {
    id:'TOOL_SHAPE_IN_SCOPE_WITHOUT_NATIVE_EFFECT',
    input:{...base,claim_kind:'TOOL_CALL_TEXT',proof_scope:'HOME_CURRENT',target_path:'/home/chrishallberg/.local/share/xi-io/agents/ibal/agent.mjs'},
    state:'TRUE_WAIT',first_red:'TOOL_CALL_TEXT_NOT_NATIVE_EFFECT'
  },
  {
    id:'TOOL_SHAPE_CANNOT_SELF_PROMOTE_WITH_RECEIPT',
    input:{...base,claim_kind:'TOOL_CALL_TEXT',proof_scope:'NATIVE_RUNTIME',target_path:'/home/chrishallberg/.local/share/xi-io/agents/ibal/agent.mjs',native_receipt:validReceipt},
    state:'TRUE_WAIT',first_red:'CLAIM_KIND_NOT_NATIVE_RECEIPT'
  },
  {
    id:'EXPECTED_HOST_MISSING',
    input:{...base,expected_host_ref:null,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:validReceipt},
    state:'TRUE_WAIT',first_red:'EXPECTED_HOST_REQUIRED'
  },
  {
    id:'ENVIRONMENT_SURVEY_MISSING',
    input:{...base,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:{...validReceipt,environment_survey_ref:null}},
    state:'TRUE_WAIT',first_red:'ENVIRONMENT_SURVEY_REQUIRED'
  },
  {
    id:'WRONG_HOST_NATIVE_RECEIPT',
    input:{...base,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:{...validReceipt,host_ref:'loki'}},
    state:'FAIL',first_red:'EXECUTION_HOST_MISMATCH'
  },
  {
    id:'WRONG_EXECUTION_SURFACE_NATIVE_RECEIPT',
    input:{...base,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:{...validReceipt,execution_surface_ref:'aries:container:other'}},
    state:'FAIL',first_red:'EXECUTION_SURFACE_MISMATCH'
  },
  {
    id:'STALE_ENVIRONMENT_SURVEY',
    input:{...base,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:{...validReceipt,environment_current:false}},
    state:'TRUE_WAIT',first_red:'ENVIRONMENT_SURVEY_STALE'
  },
  {
    id:'WRONG_GENERATION_NATIVE_RECEIPT',
    input:{...base,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:{...validReceipt,generation_ref:'g-stale'}},
    state:'FAIL',first_red:'RECEIPT_GENERATION_MISMATCH'
  },
  {
    id:'REPLAYED_NATIVE_RECEIPT',
    input:{...base,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:{...validReceipt,replayed:true}},
    state:'FAIL',first_red:'REPLAYED_NATIVE_RECEIPT'
  },
  {
    id:'SELF_VERIFIED_NATIVE_RECEIPT',
    input:{...base,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:{...validReceipt,verifier_ref:'runtime:aries'}},
    state:'FAIL',first_red:'SELF_VERIFIED_NATIVE_RECEIPT'
  },
  {
    id:'VALID_NATIVE_INDEPENDENT_READBACK',
    input:{...base,claim_kind:'NATIVE_RECEIPT',proof_scope:'NATIVE_RUNTIME',native_receipt:validReceipt},
    state:'PASS',first_red:null,promotion_allowed:true
  }
];

for(const c of cases){
  const out=evaluateApiBlackholeClaim(c.input);
  assert.equal(out.state,c.state,c.id);
  assert.equal(out.first_red,c.first_red,c.id);
  if(c.promotion_allowed!==undefined)assert.equal(out.promotion_allowed,c.promotion_allowed,c.id);
}
const pass=cases.filter(c=>evaluateApiBlackholeClaim(c.input).state==='PASS').length;
assert.equal(pass,1);
console.log(JSON.stringify({
  schema:'xiio.sdk.api-blackhole-hostile-bench/v1',
  state:'PASS',
  denominator:cases.length,
  native_promotions:pass,
  expected_false_promotions:0,
  cases:cases.map(c=>({id:c.id,expected_state:c.state,expected_first_red:c.first_red})),
  hard:[
    'TOOL_CALL_TEXT != FILE_MUTATION',
    'TOOL_CALL_TEXT + NATIVE_RECEIPT != NATIVE_RECEIPT_CLAIM',
    'TARGET_PATH_OUTSIDE_SCOPE = FAIL',
    'PATH_TRAVERSAL_OUTSIDE_SCOPE = FAIL',
    'NO_EXPECTED_HOST != NATIVE_PROMOTION',
    'NO_ENVIRONMENT_SURVEY != NATIVE_PROMOTION',
    'DESKTOP_VISIBLE != EXECUTION_CONTEXT_SURVEYED',
    'MINIMIZED_OR_HIDDEN != PROCESS_STOPPED',
    'HOST_IDENTITY != EXECUTION_SURFACE_IDENTITY',
    'NATIVE_RUNTIME + RECEIPT != SUFFICIENT_WITHOUT_FRESH_INDEPENDENT_READBACK',
    'ONE_VALID_NATIVE_CASE != ALL_EXTERNAL_CLAIMS_GREEN'
  ]
},null,2));
