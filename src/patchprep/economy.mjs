export const PATCH_PREP_ECONOMY_SCHEMA='xiio.sdk.patch-prep-economy/v1';
export const SURFACE_FAMILIES=Object.freeze([
'CHECKLIST','PUNCHCARD','SCORECARD','PLACECARD','PLACEHOLDER','HOT_FOLDER','COLD_FOLDER','DETONATOR','TRINITY','TEMPLATE','FLATPACK','PATCHSET','HOTPATCH','METER','ACK','RECEIPT','EVENT','MANIFEST','REGISTRY','ROUTER','SELECTOR','QUEUE','INBOX_OUTBOX','LEDGER','LEASE_LOCK','RETURN_REAP','CANARY','SIM','VALIDATOR','SKILL','ADAPTER','BRIDGE','CUSTODY','PREFLIGHT','BLASTWAVE','COLDSTART','WORKITEM','BACKLOG','WATERFALL','CADENCE','BURNMAP','MATRIX','QUORUM','COHORT','WAVE','PACKET','CAPSULE','AFTERCARE','DISPATCH','ADMISSION','CURRENTNESS','PROJECTION','EFFECT','ARTIFACT','BUNDLE','SNAPSHOT','FIXTURE','REPLAY'
]);
export const PREP_CELLS=Object.freeze([
'P01_CURRENT_SOURCE','P02_TARGET_IDENTITY','P03_AFFECTED_SET','P04_PRECONDITIONS','P05_ROLLBACK','P06_VALIDATOR','P07_SIM_HOSTILES','P08_IDEMPOTENCY','P09_EFFECT_CEILING','P10_METER_BINDING','P11_RETURN_READBACK_REAP','P12_NEXT_WAKE'
]);
const STATES=new Set(['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE']);
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_INVALID');return v.trim();};
const int=(v,k)=>{if(!Number.isSafeInteger(v)||v<0)throw new TypeError(k+'_INVALID');return v;};
const state=(v,k)=>{if(!STATES.has(v))throw new TypeError(k+'_INVALID');return v;};
const passLike=(s)=>s==='PASS'||s==='N_A_WITH_EVIDENCE';
function cell(raw,id){
 const s=state(raw?.state,id);
 const refs=Array.isArray(raw?.evidence_refs)?raw.evidence_refs.filter(x=>typeof x==='string'&&x.trim()):[];
 const wake=typeof raw?.wake==='string'&&raw.wake.trim()?raw.wake.trim():null;
 let defect=null;
 if(passLike(s)&&refs.length===0) defect='POSITIVE_WITHOUT_EVIDENCE';
 if((s==='WAIT'||s==='UNKNOWN')&&!wake) defect='OPEN_WITHOUT_WAKE';
 return {id,state:s,evidence_refs:refs,wake,defect};
}
function meter(ms,rateCard){
 const elapsed=int(ms,'ELAPSED_MS');
 if(!rateCard) return {elapsed_ms:elapsed,money_state:'UNPRICED',microunits:null,pricing_ref:null};
 const rate=int(rateCard.rate_microunits_per_second,'RATE');
 const ref=text(rateCard.pricing_ref,'PRICING_REF');
 const numerator=rate*elapsed;
 if(!Number.isSafeInteger(numerator))throw new TypeError('RATE_OVERFLOW');
 return {elapsed_ms:elapsed,money_state:'PRICED_PROJECTION',microunits_exact:numerator/1000,pricing_ref:ref,rate_microunits_per_second:rate,billable_authority:false};
}
export function compilePatchPrepEconomy(input={}){
 const family=text(input.surface_family,'surface_family').toUpperCase();
 if(!SURFACE_FAMILIES.includes(family))throw new TypeError('SURFACE_FAMILY_INVALID');
 const generation=text(input.generation,'generation');
 const cells=PREP_CELLS.map(id=>cell(input.cells?.[id],id));
 const prep=meter(input.prep_ms??0,input.rate_card||null);
 const deploy=meter(input.deploy_ms??0,input.rate_card||null);
 const rework=meter(input.rework_ms??0,input.rate_card||null);
 const returnReap=meter(input.return_reap_ms??0,input.rate_card||null);
 const attempts=int(input.deploy_attempts??0,'DEPLOY_ATTEMPTS');
 const failedAttempts=int(input.failed_attempts??0,'FAILED_ATTEMPTS');
 const rollbacks=int(input.rollback_count??0,'ROLLBACK_COUNT');
 const restatements=int(input.owner_restatement_count??0,'OWNER_RESTATEMENT_COUNT');
 const manualRouting=int(input.manual_routing_count??0,'MANUAL_ROUTING_COUNT');
 const staleRetries=int(input.stale_retry_count??0,'STALE_RETRY_COUNT');
 const totalMs=prep.elapsed_ms+deploy.elapsed_ms+rework.elapsed_ms+returnReap.elapsed_ms;
 const moneyState=input.rate_card?'PRICED_PROJECTION':'UNPRICED';
 const totalMicrounits=input.rate_card?[prep,deploy,rework,returnReap].reduce((n,x)=>n+(x.microunits_exact||0),0):null;
 const blockers=[
  ...cells.filter(c=>c.defect||!passLike(c.state)).map(c=>c.id+':'+(c.defect||c.state)),
  ...(failedAttempts>attempts?['FAILED_ATTEMPTS_GT_ATTEMPTS']:[])
 ];
 const prepared=blockers.length===0;
 const friction=attempts+failedAttempts+rollbacks+restatements+manualRouting+staleRetries;
 const baseline=input.baseline&&typeof input.baseline==='object'?input.baseline:null;
 let delta=null;
 if(baseline){
  const bTotal=int(baseline.total_ms,'BASELINE_TOTAL_MS');
  const bFriction=int(baseline.friction,'BASELINE_FRICTION');
  const timeSaved=bTotal-totalMs;
  const frictionSaved=bFriction-friction;
  const sameRate=Boolean(input.rate_card&&baseline.pricing_ref===input.rate_card.pricing_ref&&Number.isFinite(baseline.total_microunits));
  delta={
   time_saved_ms:timeSaved,
   friction_saved:frictionSaved,
   money_saved_microunits:sameRate?baseline.total_microunits-totalMicrounits:null,
   claim_state:(timeSaved>=0&&frictionSaved>=0)?(input.evidence_mode==='MEASURED'?'MEASURED_IMPROVEMENT':'SIMULATED_IMPROVEMENT'):'NO_IMPROVEMENT_CLAIM'
  };
 }
 return Object.freeze({
  schema:PATCH_PREP_ECONOMY_SCHEMA,generation,surface_family:family,evidence_mode:input.evidence_mode||'SIM',
  cells,prepared,blockers,
  time:{prep_ms:prep.elapsed_ms,deploy_ms:deploy.elapsed_ms,rework_ms:rework.elapsed_ms,return_reap_ms:returnReap.elapsed_ms,total_ms:totalMs},
  money:{state:moneyState,total_microunits:totalMicrounits,pricing_ref:input.rate_card?.pricing_ref||null,billable_authority:false},
  friction:{deploy_attempts:attempts,failed_attempts:failedAttempts,rollback_count:rollbacks,owner_restatement_count:restatements,manual_routing_count:manualRouting,stale_retry_count:staleRetries,total:friction},
  delta,
  detonation_admitted:prepared,
  effect_authority:false,
  hard:[
   'TIME_IS_ECONOMIC_PRESSURE','TIME!=MONEY_WITHOUT_RATE_CARD','METERED_TIME!=BILLING_AUTHORITY',
   'PREP_TIME!=WASTE_BY_DEFINITION','SIMULATED_SAVINGS!=MEASURED_SAVINGS','PREPARED!=DEPLOYED',
   'DEPLOYED!=READBACK','RESULT!=RETURN!=APPLY_RETURN!=READBACK!=REAP','ONE_MISSING_PREP_CELL_BLOCKS_DETONATION',
   'SURFACE_FAMILY_DOES_NOT_CHANGE_THE_PREP_CONTRACT'
  ]
 });
}
export function compileColdFolder(input={}){
 const itemRef=text(input.item_ref,'item_ref');
 const generation=text(input.generation,'generation');
 const reason=text(input.reason,'reason');
 const exits=Array.isArray(input.allowed_exits)&&input.allowed_exits.length?[...new Set(input.allowed_exits)]:['QUALIFY_TO_HOT_FOLDER','RETURN','REAP','ARCHIVE_WITH_PROVENANCE'];
 const allowed=new Set(['QUALIFY_TO_HOT_FOLDER','RETURN','REAP','ARCHIVE_WITH_PROVENANCE']);
 if(exits.some(x=>!allowed.has(x)))throw new TypeError('COLD_FOLDER_EXIT_INVALID');
 return Object.freeze({
  schema:'xiio.sdk.cold-folder/v1',item_ref:generation+':'+itemRef,generation,reason,
  runnable:false,detonation_allowed:false,allowed_exits:exits,
  meter_required:true,authority_granted:false,effect_authority:false,
  hard:['COLD_FOLDER!=HOT_FOLDER','COLD_FOLDER!=BACKLOG','COLD_FOLDER!=DELETED','COLD_FOLDER_CANNOT_DETONATE','COLD_FOLDER_EXIT_REQUIRES_TYPED_TRANSITION']
 });
}
