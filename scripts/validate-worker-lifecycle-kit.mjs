import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  compileWorkerLifecycleKit,
  workerLifecyclePrimitiveCatalog,
  compileWorkerAdapterConformance,
  runWorkerLifecycleAttempt,
  WORKER_ADAPTER_REQUIRED_BINDINGS,
  WORKER_RESTART_BOUNDARIES,
  WORKER_QUALIFICATION_DOMAINS,
} from '../src/worker/lifecycle.mjs';
import primitiveCatalog from '../src/catalog/primitives.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };

const catalog=workerLifecyclePrimitiveCatalog();
assert.equal(catalog.schema,'xiio.sdk.worker-lifecycle-kit/v1');
assert.equal(catalog.available_count,11);
assert.equal(catalog.gap_count,4);
assert.equal(catalog.authority_granted,false);
assert.equal(catalog.provider_effect,false);

const compiled=compileWorkerLifecycleKit({generation:'sdk:test-generation'});
assert.equal(compiled.denominator,15);
assert.equal(compiled.selected_count,15);
assert.equal(compiled.available_count,11);
assert.equal(compiled.gap_count,4);
assert.deepEqual(compiled.tool_projection,[]);
assert.equal(compiled.authority_granted,false);
assert.equal(compiled.provider_effect,false);

// An explicit applicable subset is not a request for the whole catalog.
// Omitted/undefined retains the existing catalog-default contract.
const selectionCases=[
  {id:'empty',ids:[],expected:[]},
  {id:'singleton',ids:['distributed_ack'],expected:['distributed_ack']},
  {id:'duplicate',ids:['distributed_ack','distributed_ack'],expected:['distributed_ack']},
  {id:'ordered-subset',ids:['consumer_receipt','distributed_ack'],expected:['consumer_receipt','distributed_ack']},
  {id:'undefined-default',ids:undefined,expected:compiled.selected.map(row=>row.id)},
  {id:'string',ids:'distributed_ack',error:/applicable_ids_INVALID/},
  {id:'null',ids:null,error:/applicable_ids_INVALID/},
  {id:'boolean',ids:false,error:/applicable_ids_INVALID/},
  {id:'number',ids:0,error:/applicable_ids_INVALID/},
  {id:'object',ids:{},error:/applicable_ids_INVALID/},
  {id:'invalid-member',ids:[null],error:/applicable_id_INVALID/},
  {id:'unknown-member',ids:['not-a-worker-primitive'],error:/applicable_id_UNKNOWN/},
  {id:'blank-member',ids:[''],error:/applicable_id_INVALID/},
];
for(const row of selectionCases){
  const run=()=>compileWorkerLifecycleKit({generation:'sdk:test-generation',applicable_ids:row.ids});
  if(row.error){
    assert.throws(run,row.error,row.id);
    continue;
  }
  const result=run();
  assert.deepEqual(result.selected.map(item=>item.id),row.expected,row.id);
  assert.equal(result.selected_count,row.expected.length,row.id);
  assert.equal(result.available_count+result.gap_count,result.selected_count,row.id);
  assert.equal(result.denominator,compiled.denominator,row.id);
  assert.deepEqual(result.tool_projection,[],row.id);
  assert.equal(result.authority_granted,false,row.id);
  assert.equal(result.provider_effect,false,row.id);
}

const atomic=compiled.selected.find((row)=>row.id==='atomic_protected_read');
assert.equal(atomic?.state,'GAP_FAIL_CLOSED');
assert.equal(atomic?.owner_ref,'xi-io.net#351+xi-io.net#302');
assert.ok(compiled.hard.includes('CHECK_THEN_FETCH!=ATOMIC_AUTHORIZED_READ'));
assert.ok(compiled.hard.includes('NO_ATOMIC_AUTHORIZED_READ=>REFUSE'));

for(const row of compiled.selected.filter((item)=>item.state==='AVAILABLE')){
  const key=row.specifier.replace('@xi-io/sdk','.');
  assert.ok(pkg.exports[key],`missing package export for ${row.id}: ${key}`);
}

const registered=primitiveCatalog.primitives.find((row)=>row.id==='worker-lifecycle-kit');
assert.ok(registered,'worker-lifecycle-kit is registered');
assert.equal(registered.source,'src/worker/lifecycle.mjs');
assert.equal(registered.specifier,'@xi-io/sdk/worker/lifecycle');
assert.equal(primitiveCatalog.dispatch.expected,primitiveCatalog.primitives.length);
assert.equal(primitiveCatalog.dispatch.materialized_primitives,primitiveCatalog.primitives.length);

assert.throws(
  ()=>compileWorkerLifecycleKit({generation:'sdk:test-generation',applicable_ids:['not-a-worker-primitive']}),
  /applicable_id_UNKNOWN/,
);
assert.throws(()=>compileWorkerLifecycleKit({}),/generation_INVALID/);

const lifecycleGeneration='sdk:worker-lifecycle:g1';
const adapterGeneration='adapter:g1';
const qualDomain=(name)=>({
  execution_ref:`e:${name}:execute`,
  hostile_ref:`e:${name}:hostile`,
  independent_review_ref:`e:${name}:review`,
  executor_principal_ref:`principal:${name}:execute`,
  hostile_principal_ref:`principal:${name}:hostile`,
  reviewer_principal_ref:`principal:${name}:review`,
});
const fullBindings=()=>({
  work_generation:{verified:true,evidence_ref:'e:work',work_ref:'work:1',generation_ref:'work:g1'},
  currentness_recovery:{verified:true,evidence_ref:'e:current',currentness_ref:'current:g1',recovery_ref:'recovery:1',hallberg_recovery_ref:'hallberg:recovery:1',lifecycle_selected:true,keyword_triggered:false,ordinary_work_covered:true},
  admission:{verified:true,evidence_ref:'e:admission',assignment_ref:'assignment:1',principal_ref:'principal:worker:1',admission_ref:'admission:1',current:true},
  tool_capability:{verified:true,evidence_ref:'e:tools',capability_ref:'capability:1',tool_catalog_ref:'tools:g1',qualified:true,current:true},
  ack:{verified:true,evidence_ref:'e:ack',ack_ref:'ack:1',sow_ref:'sow:1'},
  privacy_effect:{verified:true,evidence_ref:'e:privacy',privacy_ref:'privacy:1',effect_ceiling:'READ_ONLY'},
  bounded_execution:{verified:true,evidence_ref:'e:execution',attempt_ref:'attempt:1',execution_ref:'execution:1',bounded:true},
  yar:{verified:true,evidence_ref:'e:yar',yar_ref:'yar:1',interrupted_return_reconciled:true},
  result_return:{verified:true,evidence_ref:'e:return',result_ref:'result:1',return_ref:'return:1',apply_return_ref:'apply:1',exactly_once:true,retry_completes_owed_writes:true},
  verified_readback:{verified:true,evidence_ref:'e:readback',readback_ref:'readback:1',consumer_ref:'consumer:1'},
  affected_recompile:{verified:true,evidence_ref:'e:affected',affected_set_ref:'affected:1',recompile_ref:'recompile:1',all_and_only:true},
  restart_reconciliation:{verified:true,evidence_ref:'e:restart',coverage_ref:'restart:1',covered_boundaries:[...WORKER_RESTART_BOUNDARIES]},
  qualification_independence:{verified:true,evidence_ref:'e:qualification',domains:Object.fromEntries(WORKER_QUALIFICATION_DOMAINS.map((name)=>[name,qualDomain(name)]))},
  installed_consumer:{verified:true,evidence_ref:'e:installed',installed_generation:adapterGeneration,lifecycle_generation:lifecycleGeneration},
});
const conforming=()=>({
  adapter_id:'adapter:test',
  adapter_kind:'OLLAMA_LOCAL',
  source_generation:adapterGeneration,
  installed_generation:adapterGeneration,
  lifecycle_generation:lifecycleGeneration,
  bindings:fullBindings(),
});

let adapter=compileWorkerAdapterConformance(conforming());
assert.equal(adapter.schema,'xiio.sdk.worker-adapter-lifecycle-conformance/v1');
assert.equal(adapter.denominator,WORKER_ADAPTER_REQUIRED_BINDINGS.length);
assert.equal(adapter.pass,WORKER_ADAPTER_REQUIRED_BINDINGS.length);
assert.equal(adapter.fail,0);
assert.equal(adapter.release_eligible,false);
assert.equal(adapter.structural_eligible,true);
assert.equal(adapter.supplied_complete,true);
assert.equal(adapter.runtime_complete,false);
assert.equal(adapter.verification_state,'SUPPLIED_UNVERIFIED');
assert.equal(adapter.first_red,null);
assert.equal(adapter.authority_granted,false);
assert.equal(adapter.provider_effect,false);

for(const missing of WORKER_ADAPTER_REQUIRED_BINDINGS){
  const input=conforming();
  delete input.bindings[missing];
  const result=compileWorkerAdapterConformance(input);
  assert.equal(result.release_eligible,false,missing);
  assert.equal(result.first_red?.id,missing,missing);
  assert.equal(result.first_red?.state,'MISSING',missing);
}

for(const [binding,field,reason] of [
  ['work_generation','generation_ref','WORK_GENERATION_IDENTITY_INCOMPLETE'],
  ['currentness_recovery','hallberg_recovery_ref','CURRENTNESS_RECOVERY_INCOMPLETE'],
  ['admission','assignment_ref','REAL_ADMISSION_BINDING_INCOMPLETE'],
  ['tool_capability','capability_ref','TOOL_CAPABILITY_NOT_CURRENT_QUALIFIED'],
  ['ack','sow_ref','ACK_SOW_BINDING_INCOMPLETE'],
  ['privacy_effect','privacy_ref','PRIVACY_EFFECT_BOUNDARY_INCOMPLETE'],
  ['bounded_execution','attempt_ref','BOUNDED_EXECUTION_INCOMPLETE'],
  ['yar','yar_ref','YAR_REF_MISSING'],
  ['result_return','apply_return_ref','RESULT_RETURN_CHAIN_INCOMPLETE'],
  ['verified_readback','readback_ref','VERIFIED_READBACK_INCOMPLETE'],
  ['affected_recompile','affected_set_ref','AFFECTED_ONLY_RECOMPILE_INCOMPLETE'],
]){
  const input=conforming();
  delete input.bindings[binding][field];
  const result=compileWorkerAdapterConformance(input);
  assert.equal(result.release_eligible,false,reason);
  assert.equal(result.cells.find((row)=>row.id===binding)?.reason,reason);
}

for(const [mutate,binding,reason] of [
  [x=>{x.bindings.currentness_recovery.lifecycle_selected=false;},'currentness_recovery','RECOVERY_NOT_LIFECYCLE_SELECTED'],
  [x=>{x.bindings.currentness_recovery.keyword_triggered=true;},'currentness_recovery','KEYWORD_TRIGGERED_RECOVERY_FORBIDDEN'],
  [x=>{x.bindings.currentness_recovery.ordinary_work_covered=false;},'currentness_recovery','ORDINARY_WORK_RECOVERY_BYPASS'],
  [x=>{x.bindings.admission.current=false;},'admission','REAL_ADMISSION_BINDING_INCOMPLETE'],
  [x=>{x.bindings.tool_capability.qualified=false;},'tool_capability','TOOL_CAPABILITY_NOT_CURRENT_QUALIFIED'],
  [x=>{x.bindings.bounded_execution.bounded=false;},'bounded_execution','BOUNDED_EXECUTION_INCOMPLETE'],
  [x=>{x.bindings.yar.interrupted_return_reconciled=false;},'yar','YAR_INTERRUPTED_RETURN_UNRECONCILED'],
  [x=>{x.bindings.result_return.exactly_once=false;},'result_return','RESULT_RETURN_NOT_EXACTLY_ONCE'],
  [x=>{x.bindings.result_return.retry_completes_owed_writes=false;},'result_return','INTERRUPTED_RETURN_RETRY_DOES_NOT_COMPLETE_OWED_WRITES'],
  [x=>{x.bindings.affected_recompile.all_and_only=false;},'affected_recompile','AFFECTED_ONLY_RECOMPILE_INCOMPLETE'],
]){
  const input=conforming();
  mutate(input);
  const result=compileWorkerAdapterConformance(input);
  assert.equal(result.release_eligible,false,reason);
  assert.equal(result.cells.find((row)=>row.id===binding)?.reason,reason);
}

{
  const input=conforming();
  input.bindings.restart_reconciliation.covered_boundaries=input.bindings.restart_reconciliation.covered_boundaries.filter((x)=>x!=='YAR');
  const result=compileWorkerAdapterConformance(input);
  assert.equal(result.release_eligible,false);
  assert.match(result.cells.find((row)=>row.id==='restart_reconciliation')?.reason||'',/RESTART_RECONCILIATION_BOUNDARY_MISSING:YAR/);
}

{
  const input=conforming();
  input.bindings.qualification_independence.domains.admission.reviewer_principal_ref=
    input.bindings.qualification_independence.domains.admission.executor_principal_ref;
  const result=compileWorkerAdapterConformance(input);
  assert.equal(result.release_eligible,false);
  assert.equal(
    result.cells.find((row)=>row.id==='qualification_independence')?.reason,
    'QUALIFICATION_PRINCIPALS_NOT_INDEPENDENT:admission',
  );
}

{
  const input=conforming();
  delete input.bindings.qualification_independence.domains.affected_return.hostile_ref;
  const result=compileWorkerAdapterConformance(input);
  assert.equal(result.release_eligible,false);
  assert.equal(
    result.cells.find((row)=>row.id==='qualification_independence')?.reason,
    'QUALIFICATION_DOMAIN_INCOMPLETE:affected_return',
  );
}

for(const adapter_kind of ['BASE44_CLOUD','HEX_NATIVE','OLLAMA_LOCAL','CLI_MCP','FUTURE_PROVIDER']){
  const input=conforming();
  input.adapter_kind=adapter_kind;
  const pass=compileWorkerAdapterConformance(input);
  assert.equal(pass.release_eligible,false,adapter_kind);
  assert.equal(pass.structural_eligible,true,adapter_kind);
  delete input.bindings.ack;
  const fail=compileWorkerAdapterConformance(input);
  assert.equal(fail.release_eligible,false,adapter_kind);
  assert.equal(fail.first_red?.id,'ack',adapter_kind);
}

let stale=conforming();
stale.installed_generation='adapter:g0';
stale.bindings.installed_consumer.installed_generation='adapter:g0';
adapter=compileWorkerAdapterConformance(stale);
assert.equal(adapter.release_eligible,false);
assert.equal(adapter.cells.find((row)=>row.id==='installed_consumer')?.reason,'INSTALLED_GENERATION_MISMATCH');

stale=conforming();
stale.bindings.installed_consumer.lifecycle_generation='sdk:worker-lifecycle:old';
adapter=compileWorkerAdapterConformance(stale);
assert.equal(adapter.release_eligible,false);
assert.equal(adapter.cells.find((row)=>row.id==='installed_consumer')?.reason,'LIFECYCLE_GENERATION_MISMATCH');

const gamified=compileWorkerAdapterConformance({
  ...conforming(),
  gamification:{level:999,score:1000000,rank:'META_ARCHITECT',effect_authority:true},
});
assert.equal(gamified.release_eligible,false);
assert.equal(gamified.structural_eligible,true);
assert.equal(gamified.authority_granted,false);
assert.equal(gamified.provider_effect,false);
assert.ok(gamified.hard.includes('GAMIFICATION!=AUTHORITY'));
assert.ok(gamified.hard.includes('MISSING_ADAPTER_BINDING=>RELEASE_FAIL'));

const source=fs.readFileSync(new URL('../src/worker/lifecycle.mjs',import.meta.url),'utf8');
assert.doesNotMatch(source,/effect_authority\s*:\s*true/);
assert.doesNotMatch(source,/provider_effect\s*:\s*true/);



// Payload-authentication, agent labels and historical STARTED are never proof.
for (const claims of [
  {authenticated:true,verified:true,runtime_complete:true,release_eligible:true},
  {state:'STARTED',agent_label:'Ibal',process_pid:1,heartbeat:'current'},
  {provider_ref:'provider:claimed',account_ref:'account:claimed',capability_ref:'capability:claimed'},
]) {
  const supplied=conforming();
  Object.assign(supplied,claims);
  for (const row of Object.values(supplied.bindings)) Object.assign(row,claims);
  const observed=compileWorkerAdapterConformance(supplied);
  assert.equal(observed.structural_eligible,true);
  assert.equal(observed.supplied_complete,true);
  assert.equal(observed.runtime_complete,false);
  assert.equal(observed.release_eligible,false);
  assert.equal(observed.runtime_first_red,'AUTHENTICATED_GENERATION_BOUND_WORKER_PROOF_REQUIRED');
}

// Public shared phase engine refuses unbound owners before any execution.
await assert.rejects(runWorkerLifecycleAttempt(),{code:'WORKER_BINDING_REQUIRED'});
await assert.rejects(runWorkerLifecycleAttempt({
  binding:Object.fromEntries(['project_id','work_id','assignment_ref','attempt_id','agent_id','source_generation','return_ref','operation_ref'].map(key=>[key,'fixture:'+key])),
  jobId:'fixture:job',
}),{code:'WORKER_OWNERS_UNBOUND'});

// Cached phase evidence must bind to this Work/attempt, even on duplicate return.
{
  const binding=Object.fromEntries(['project_id','work_id','assignment_ref','attempt_id','agent_id','source_generation','return_ref','operation_ref'].map(key=>[key,'fixture:'+key]));
  const result={...binding,state:'COMPLETE',result_ref:'fixture:result'};
  const journal=[
    {type:'CLAIM',data:{...binding}},
    {type:'EXECUTION_STARTED',data:{...binding,admission_ref:'fixture:admission'}},
    {type:'RESULT',data:{...result,result_digest:JSON.stringify(result)}},
    {type:'RETURN',data:{...binding,result_ref:result.result_ref}},
    {type:'APPLY_RETURN_STARTED',data:{...binding}},
    {type:'APPLY_RETURN',data:{...binding,state:'APPLIED',result_ref:result.result_ref,receipt_ref:'fixture:receipt'}},
    {type:'WAKE_ACK',data:{...binding,receipt_ref:'fixture:receipt'}},
  ];
  let effects=0;
  const forbidden=async()=>{effects++;throw new Error('CACHED_REPLAY_EXECUTED_EFFECT');};
  const run=history=>runWorkerLifecycleAttempt({binding,jobId:'fixture:job',history:async()=>history,
    current:async()=>{},dependenciesDone:async()=>true,append:forbidden,checkpoint:forbidden,
    qualifiedHost:{qualify:forbidden,request:forbidden},applyReturn:{apply:forbidden},
    publishReturn:forbidden,wakeConsumer:forbidden,digest:JSON.stringify});
  assert.equal((await run(journal)).duplicate,true);
  for(let i=0;i<journal.length;i++) for(const key of Object.keys(binding)) {
    const invalid=structuredClone(journal);invalid[i].data[key]='fixture:foreign';
    await assert.rejects(run(invalid),{code:'PERSISTED_PHASE_BINDING_INVALID'});
  }
  for(const invalid of [[journal.at(-1)],[...journal,journal.at(-1)],journal.slice(1),[journal[1],journal[0]]]) {
    await assert.rejects(run(invalid),{code:'PERSISTED_PHASE_ORDER_INVALID'});
  }
  for(const [index,key,code] of [
    [1,'admission_ref','PERSISTED_ADMISSION_INVALID'],
    [2,'result_ref','PERSISTED_RESULT_INVALID'],
    [2,'result_digest','PERSISTED_RESULT_DIGEST_INVALID'],
    [3,'result_ref','PERSISTED_RETURN_LINK_INVALID'],
    [5,'receipt_ref','PERSISTED_APPLY_RETURN_LINK_INVALID'],
    [5,'result_ref','PERSISTED_APPLY_RETURN_LINK_INVALID'],
    [6,'receipt_ref','PERSISTED_WAKE_LINK_INVALID'],
  ]) {
    const invalid=structuredClone(journal);invalid[index].data[key]='';
    await assert.rejects(run(invalid),{code});
  }
  assert.equal(effects,0);
}


const sharedConnection=await import('../src/worker/connection.mjs');
const lifecycleModule=await import('../src/worker/lifecycle.mjs');
assert.equal(lifecycleModule.createSharedWorkerConnection,sharedConnection.createSharedWorkerConnection,
  'SDK205_CONNECTION_MUST_REUSE_ONE_WORKER_OWNER');
assert.equal(lifecycleModule.runWorkerLifecycleAttempt,runWorkerLifecycleAttempt,
  'SDK204_PHASE_ENGINE_MUST_USE_ONE_SDK_EXPORT');
assert.equal(pkg.exports['./worker/lifecycle'],'./src/worker/lifecycle.mjs');
assert.equal(pkg.exports['./worker/connection'],'./src/worker/connection.mjs');
assert.equal(compileWorkerAdapterConformance(conforming()).runtime_complete,false);
assert.equal(compileWorkerAdapterConformance(conforming()).release_eligible,false);

console.log(JSON.stringify({
  state:'PASS',
  schema:catalog.schema,
  registered_primitive:'worker-lifecycle-kit',
  denominator:compiled.denominator,
  bounded_selection_cases:selectionCases.length,
  available:compiled.available_count,
  gaps:compiled.gap_count,
  tool_projection:compiled.tool_projection.length,
  authority_granted:false,
  provider_effect:false,
},null,2));
