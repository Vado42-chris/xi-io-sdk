import assert from 'node:assert/strict';
import {compileColdStartFlatpack,coldStartFlatpackPayloadRoles,COLD_START_FLATPACK_INPUT_SCHEMA} from '../src/flatpack/cold-start.mjs';

const GEN='g1';
const ROOT='5267f93e-2af8-57c8-975d-21fcbf77683e';
const WORK='d4a4906a-80ec-54ed-aeb1-364154a486a9';
function base(){
  return {
    schema:COLD_START_FLATPACK_INPUT_SCHEMA,
    package_id:'coldpack:test:g1',
    generation:GEN,
    project_ref:'project:search',
    root_uuid:ROOT,
    work_uuid:WORK,
    payload:[
      {role:'CURRENT_SELECTOR',ref:'search/project-current.json',generation:GEN,state:'CURRENT'},
      {role:'CURRENT_ACK',ref:'search/ack.json',generation:GEN,state:'CURRENT'},
      {role:'CURRENT_DENOMINATOR',ref:'search/search-100s.current.json',generation:GEN,state:'CURRENT'},
      {role:'TOOL_CAPABILITY_DELTA',ref:'search/tool-delta.json',generation:GEN,state:'CURRENT'},
      {role:'CURRENT_SKILLS',ref:'skills/run-rotfl-atomic-gate/SKILL.md',generation:GEN,state:'CURRENT'},
      {role:'CURRENT_LEXICON',ref:'standards/lexicon/current.json',generation:GEN,state:'CURRENT'},
      {role:'RETURN_TARGETS',ref:'search/burn-closeout.current.json',generation:GEN,state:'CURRENT'},
    ],
    providers:[
      {provider_ref:'github',state:'STALE',required_for_current_work:true,source_refs:['repo:studio','repo:inbox'],rate_limit_bucket:'github'},
      {provider_ref:'slack',state:'RATE_LIMITED',required_for_current_work:false,source_refs:['channel:search'],rate_limit_bucket:'slack'},
      {provider_ref:'google',state:'CURRENT_WITH_RECEIPT',last_receipt_ref:'receipt:google:g1',required_for_current_work:true,source_refs:['drive:search'],rate_limit_bucket:'google'},
    ],
    provider_policy:{max_attempts_per_bucket:1},
    apply_return_target:'search/current',
    readback_target:'search/current',
    bins_custody_target:'bins:search:coldpack',
    reap_target:'search:reap'
  };
}

const clean=compileColdStartFlatpack(base());
assert.equal(clean.onboarding_ready,true);
assert.equal(clean.local_hydration.provider_calls_required_for_bootstrap,0);
assert.equal(clean.provider_delta_plan.planned_attempt_count,0);
assert.equal(clean.provider_delta_plan.request_count,1);
assert.equal(clean.provider_delta_plan.requests[0].bucket,'github');
assert.equal(clean.provider_delta_plan.requests[0].attempt,0);
assert.equal(clean.provider_delta_plan.requests[0].automatic_cloud_fallback,false);
assert.equal(clean.provider_dispositions.find(x=>x.provider_ref==='slack').disposition,'DEFER_NOT_REQUIRED');
assert.equal(clean.provider_dispositions.find(x=>x.provider_ref==='google').disposition,'NO_CALL_CURRENT');
assert.equal(clean.flatpack_patch.detonation_admitted,true);
assert.equal(coldStartFlatpackPayloadRoles().length,7);

{
  const x=base();
  x.providers=[
    {provider_ref:'github:repo1',state:'STALE',required_for_current_work:true,source_refs:['r1'],rate_limit_bucket:'github'},
    {provider_ref:'github:repo2',state:'UNKNOWN',required_for_current_work:true,source_refs:['r2'],rate_limit_bucket:'github'},
    {provider_ref:'github:repo3',state:'RATE_LIMITED',required_for_current_work:true,source_refs:['r3'],rate_limit_bucket:'github'},
  ];
  const o=compileColdStartFlatpack(x);
  assert.equal(o.provider_delta_plan.request_count,1,'same rate-limit bucket must batch');
  assert.deepEqual(o.provider_delta_plan.requests[0].provider_refs,['github:repo1','github:repo2','github:repo3']);
  assert.equal(o.provider_delta_plan.maximum_attempt_ceiling,1);
}

{
  const x=base();
  x.payload=x.payload.filter(r=>r.role!=='CURRENT_ACK');
  const o=compileColdStartFlatpack(x);
  assert.equal(o.onboarding_ready,false);
  assert(o.local_hydration.missing_roles.includes('CURRENT_ACK'));
  assert.equal(o.provider_delta_plan.planned_attempt_count,0);
}

{
  const x=base();
  x.payload[0].generation='old';
  const o=compileColdStartFlatpack(x);
  assert.equal(o.onboarding_ready,false);
  assert.equal(o.local_hydration.stale_required_payload.length,1);
}

let hostileRejected=0;
const mutators=[
  x=>{x.payload=x.payload.filter(r=>r.role!=='CURRENT_SELECTOR');},
  x=>{x.payload=x.payload.filter(r=>r.role!=='CURRENT_ACK');},
  x=>{x.payload=x.payload.filter(r=>r.role!=='CURRENT_DENOMINATOR');},
  x=>{x.payload=x.payload.filter(r=>r.role!=='TOOL_CAPABILITY_DELTA');},
  x=>{x.payload=x.payload.filter(r=>r.role!=='CURRENT_SKILLS');},
  x=>{x.payload=x.payload.filter(r=>r.role!=='CURRENT_LEXICON');},
  x=>{x.payload=x.payload.filter(r=>r.role!=='RETURN_TARGETS');},
  x=>{x.payload[0].generation='stale';},
  x=>{x.root_uuid='bad';},
  x=>{x.work_uuid='bad';},
];
for(let i=0;i<200;i++){
  const x=structuredClone(base());
  mutators[i%mutators.length](x);
  let rejected=false;
  try{
    const o=compileColdStartFlatpack(x);
    rejected=o.onboarding_ready===false;
  }catch{rejected=true;}
  assert.equal(rejected,true,'hostile '+i+' must reject or wait-local');
  hostileRejected++;
}
assert.equal(hostileRejected,200);

console.log(JSON.stringify({
  schema:'xiio.sdk.cold-start-flatpack-check/v1',
  result:'PASS',
  payload_roles:7,
  provider_bootstrap_attempts:0,
  batched_provider_request_count:1,
  hostile_denominator:200,
  hostile_rejected:200,
  false_green:0,
  effects:0
}));
