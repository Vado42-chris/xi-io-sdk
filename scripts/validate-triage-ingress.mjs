#!/usr/bin/env node
import assert from 'node:assert/strict';
import {compileTriageIngress} from '../src/ibal/triage-ingress.mjs';

const base=()=>({
 schema:'xiio.sdk.triage-ingress/v1',
 occurrence_ref:'conversation:first-material-canary',
 generation:'g1',
 root_ref:'root:search',
 work_ref:'work:search',
 checklist_ref:'SEARCH_100S_G1',
 signals:{
  material_canary:true,
  owner_correction:false,
  legal_wording_risk:true,
  named_path_unresolved:true,
  currentness_unknown:true,
  denominator_incomplete:true,
  reciprocal_ux_risk:true,
  contradiction_present:false,
  truncation_risk:true,
  false_green_recurrence:false,
  distinct_perspectives:4
 },
 partitions:[
  {partition_ref:'p:legal-wording',semantic_key:'LEGAL_WORDING',state:'AFFECTED',equivalence_key:'LEGAL',evidence_refs:['e:1']},
  {partition_ref:'p:path-currentness',semantic_key:'PATH_CURRENTNESS',state:'UNKNOWN',equivalence_key:'CURRENTNESS',evidence_refs:['e:2'],wake:'resolve owners'},
  {partition_ref:'p:ux-human',semantic_key:'RECIPROCAL_UX_HUMAN',state:'AFFECTED',equivalence_key:'UX',evidence_refs:['e:3']},
  {partition_ref:'p:ux-ai',semantic_key:'RECIPROCAL_UX_AI',state:'AFFECTED',equivalence_key:'UX',evidence_refs:['e:4']}
 ],
 history:{first_material_canary_ref:'conversation:first-material-canary',serial_steps_before_triage:12}
});

let r=compileTriageIngress(base());
assert.equal(r.triage_required,true);
assert.equal(r.decision,'FORM_SIM_TRIAGE_NOW');
assert.equal(r.historical_timing_state,'LATE_TRIAGE');
assert.equal(r.raw_partition_denominator,4);
assert.equal(r.quantized_partition_denominator,3);
assert.equal(r.simulated_team_denominator,3);
assert.equal(r.live_materialized_teams,0);
assert.equal(r.simulated_teams.every(t=>t.roles.length===3),true);

{
 const x=base();x.history.serial_steps_before_triage=0;
 r=compileTriageIngress(x);assert.equal(r.historical_timing_state,'ON_TIME_OR_NOT_APPLICABLE');
}
{
 const x=base();x.signals={material_canary:true,distinct_perspectives:1};
 r=compileTriageIngress(x);assert.equal(r.triage_required,false);assert.equal(r.decision,'SINGLETON_OK');
}
{
 const x=base();x.partitions=[];
 r=compileTriageIngress(x);assert.equal(r.decision,'WAIT_PARTITION_CENSUS');
}
{
 const x=base();x.partitions.push({...x.partitions[0]});
 assert.throws(()=>compileTriageIngress(x),/DUPLICATE_PARTITION_REF/);
}

const dimensions=['legal_wording_risk','named_path_unresolved','currentness_unknown','denominator_incomplete','reciprocal_ux_risk','contradiction_present','truncation_risk','false_green_recurrence'];
let hostiles=0;
for(let mask=0;mask<256;mask++){
 const x=base();
 for(let i=0;i<dimensions.length;i++)x.signals[dimensions[i]]=Boolean(mask&(1<<i));
 x.signals.distinct_perspectives=mask===0?1:2;
 const out=compileTriageIngress(x);
 const expected=mask!==0;
 assert.equal(out.triage_required,expected,'mask '+mask);
 hostiles++;
}
assert.equal(hostiles,256);

console.log(JSON.stringify({
 schema:'xiio.sdk.triage-ingress-check/v1',
 result:'PASS',
 binary_signal_denominator:256,
 false_green:0,
 retrospective_late_triage_detected:true,
 quantize_before_fanout:true,
 n_sim_teams:true,
 effect_authority:0
},null,2));
