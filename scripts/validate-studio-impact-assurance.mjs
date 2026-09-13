#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileStudioImpactAssurance, STUDIO_IMPACT_ASSURANCE_SCHEMA } from '../src/ibal/studio-impact-assurance.mjs';

const node = (ref, dependencies=[]) => ({
  ref, direction:'CURRENT', state:'AFFECTED', currentness:'CURRENT', priority:'P1',
  risk:1, user_impact:1, time_pressure:1, fanout:1, cognitive_load:1,
  human_facing:true, independent_review_required:false, ux_review_required:false,
  parallel_safe:true, runnable:true, dependencies,
});
const evidence = {
  data_forge:{owner_product:'xi-io-dev_forge',contract_ref:'devforge:context:g1',receipt_ref:'rcp:devforge:g1',verified:true},
  dotproject:{owner_product:'dotproject',contract_ref:'dotproject:project:42',receipt_ref:'rcp:dotproject:g1',verified:true},
  bugzilla:{owner_product:'bugzilla',contract_ref:'bugzilla:1234',receipt_ref:'rcp:bugzilla:g1',verified:true},
};
const observations = () => ({
  data_forge:{native_readback_ref:'native:devforge:g1',observation_receipt_ref:'obs:devforge:g1',observed_generation:'g1',currentness:'CURRENT',trust_class:'SERVER_OWNED_READBACK'},
  dotproject:{native_readback_ref:'native:dotproject:g1',observation_receipt_ref:'obs:dotproject:g1',observed_generation:'g1',currentness:'CURRENT',trust_class:'SERVER_OWNED_READBACK'},
  bugzilla:{native_readback_ref:'native:bugzilla:g1',observation_receipt_ref:'obs:bugzilla:g1',observed_generation:'g1',currentness:'CURRENT',trust_class:'SERVER_OWNED_READBACK'},
});
const base = () => ({
  schema: STUDIO_IMPACT_ASSURANCE_SCHEMA,
  roster: {
    state_root:'/tmp/xiio-studio-impact',
    registry_complete:true,
    registry_ref:'studio-roster:test',
    registry_digest:'sha256:test',
    registry_receipt_ref:'rcp:studio-roster:test',
    expected_product_count:2,
    evidence_stack:evidence,
    products:[
      {product_id:'inbox',dependencies:['publisher']},
      {product_id:'publisher',dependencies:[]},
    ],
  },
  impact: {
    schema:'xiio.sdk.impact-formation/v1',
    root:{root_ref:'root:studio',generation:'g1',golden_priority_ref:'golden:studio',formation_profile_ref:'formation:TRINITY_V1'},
    nodes:[node('product:inbox',['product:publisher']),node('product:publisher',[])],
  },
  product_node_refs:{inbox:'product:inbox',publisher:'product:publisher'},
});

{
  const out=compileStudioImpactAssurance(base());
  assert.equal(out.reliable,false);
  assert.equal(out.structural_complete,false);
  assert.equal(out.first_red,'BINS_EVIDENCE_TRINITY_UNPROVEN');
  assert.deepEqual(out.blockers.find(x=>x.code==='BINS_EVIDENCE_TRINITY_UNPROVEN').unproven,['data_forge','dotproject','bugzilla']);
  assert.equal(out.effects,0);
  assert.equal(out.authority_granted,false);
}

{
  const input=base();
  input.evidence_observations=observations();
  const out=compileStudioImpactAssurance(input);
  assert.equal(out.structural_complete,true);
  assert.equal(out.reliable,false);
  assert.equal(out.proof_state,'STRUCTURALLY_COMPLETE_NATIVE_VERIFICATION_REQUIRED');
  assert.equal(out.first_red,'NATIVE_VERIFICATION_REQUIRED');
  assert.deepEqual(out.verification_required,['BINS_PROVIDER_NATIVE_READBACK_VERIFIER']);
  assert.equal(out.blockers.length,0);
  assert.equal(out.roster.product_count,2);
}

{
  const input=base();
  delete input.roster.products[0].dependencies;
  input.evidence_observations=observations();
  const out=compileStudioImpactAssurance(input);
  assert.equal(out.structural_complete,false);
  assert(out.blocker_codes.includes('STUDIO_PRODUCT_DEPENDENCY_DECLARATIONS_MISSING'));
}

{
  const input=base();
  input.evidence_observations=observations();
  input.impact.nodes[0].dependencies=[];
  const out=compileStudioImpactAssurance(input);
  assert.equal(out.structural_complete,false);
  assert(out.blocker_codes.includes('STUDIO_IMPACT_DEPENDENCY_EDGE_MISSING'));
}

{
  const input=base();
  input.roster.expected_product_count=4;
  input.roster.products=[
    {product_id:'inbox',dependencies:[]},
    {product_id:'publisher',dependencies:[]},
    {product_id:'devforge',dependencies:[]},
    {product_id:'dataforge',dependencies:[]},
  ];
  input.impact.nodes=[node('product:inbox'),node('product:publisher'),node('product:devforge'),node('product:dataforge')];
  input.product_node_refs={inbox:'product:inbox',publisher:'product:publisher',devforge:'product:devforge',dataforge:'product:dataforge'};
  input.evidence_observations=observations();
  const blocked=compileStudioImpactAssurance(input);
  assert(blocked.blocker_codes.includes('DEVFORGE_DATAFORGE_IDENTITY_COLLISION'));
  input.identity_aliases=[{alias:'dataforge',canonical:'devforge',evidence_ref:'devforge-readme:historical-dataFORGE-lineage'}];
  const aliased=compileStudioImpactAssurance(input);
  assert(!aliased.blocker_codes.includes('DEVFORGE_DATAFORGE_IDENTITY_COLLISION'));
  assert.equal(aliased.reliable,false);
}

console.log('STUDIO_IMPACT_ASSURANCE_PASS 5/5 SOURCE_VALIDATOR_ONLY');
