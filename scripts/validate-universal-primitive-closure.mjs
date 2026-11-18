#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  validateUniversalArtifact,
  executeUniversalPrimitiveOperation,
  extractUniversalTemplateRig,
  compileUniversalProjection,
  reverseUniversalProjectionReadback,
} from '../src/flatpack/universal-primitive.mjs';
import {
  UNIVERSAL_PRIMITIVE_CONTRACT,
  validatePrimitiveAgainstUniversalContract,
} from '../src/flatpack/universal-primitive-contract.mjs';

const primitive=(identity,semantic_type)=>({
  identity,
  semantic_type,
  coordinates:{
    value:identity,axis:['x','y','z'],scale:'5s',plane:'plane:closure',
    direction:'forward',orientation:'screen',projection:'article',
  },
  relationships:[],
  operations:[...UNIVERSAL_PRIMITIVE_CONTRACT.structural_operations],
  provenance:{source:'sdk-closure-canary:#168'},
  authority:{visibility:'PUBLIC',effect_ceiling:'READ_ONLY'},
  state:'CURRENT',
  version:'1',
  projection:['article','microsite'],
  geometry:{x:0,y:0,width:100,height:40},
  content:{text:identity},
  style:{},
});

const doc={
  schema:'xiio.flatpack/v1',
  artifact:{artifact_ref:'artifact:sdk-closure',version_ref:'version:sdk-closure@1',template_ref:'template:sdk-closure'},
  shared_flatplane:{plane_ref:'plane:closure',scale:'5s',domain_ref:'domain:closure',patch_refs:['patch:closure']},
  parametric_domain:{domain_ref:'domain:closure',axes:['x','y','z','order']},
  continuity_constraints:{adjacency:[],constraint_continuity:[],stable_primitive_refs:true},
  local_control_patches:[{patch_ref:'patch:closure',plane_ref:'plane:closure',domain_window:{x:[0,1],y:[0,1]},primitive_refs:['p:headline']}],
  seam_equivalence:[],
  primitives:[primitive('p:headline','heading')],
  extrusions:[],
  projection_recipes:[
    {projection_ref:'projection:article',kind:'article',artifact_ref:'artifact:sdk-closure',primitive_refs:['p:headline']},
    {projection_ref:'projection:microsite',kind:'microsite',artifact_ref:'artifact:sdk-closure',primitive_refs:['p:headline']},
  ],
  lineage:{source_generation:'sdk-closure:g1',parent_version_ref:null,digest:'sdk-closure-source'},
  authority:{visibility:'PUBLIC',effect_ceiling:'READ_ONLY'},
  receipts:[],
  metadata:{article_ref:'article:sdk-closure',template_defaults:{},responsive_rules:{},contextual_tools:[],contextual_settings:[]},
};

assert.equal(validateUniversalArtifact(doc).ok,true);

const classPrimitive=primitive('p:class','class');
const admission=validatePrimitiveAgainstUniversalContract(classPrimitive);
assert.equal(admission.ok,true);
assert.equal(admission.semantic_type,'class');
assert.equal(admission.contract_ref,UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_ref);
assert.equal(admission.contract_blob_sha,UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_blob_sha);

const created=executeUniversalPrimitiveOperation(doc,{
  operation_ref:'op:sdk-closure:create-class',
  actor:{kind:'human',ref:'person:owner'},
  operation:'CREATE',
  args:{
    patch_ref:'patch:closure',
    projection_refs:['projection:article','projection:microsite'],
    primitive:classPrimitive,
  },
});
assert.equal(created.receipt.primitive_ref,'p:class');

const rig=extractUniversalTemplateRig(created.artifact);
const rigClass=rig.primitive_graph.find(p=>p.primitive_ref==='p:class');
assert.equal(rigClass.semantic_type,'class');

const projection=compileUniversalProjection(created.artifact,'projection:microsite');
const projectedClass=projection.blocks.find(b=>b.primitive_ref==='p:class');
assert.equal(projectedClass.semantic_type,'class');

const readback=reverseUniversalProjectionReadback(created.artifact,projection);
assert.equal(readback.ok,true);
assert.ok(readback.primitive_refs.includes('p:class'));

const beforeInvalid=structuredClone(created.artifact);
const invalid=primitive('p:foreign','foreign_type');
assert.equal(validatePrimitiveAgainstUniversalContract(invalid).first_red,'PRIMITIVE_SEMANTIC_TYPE');
assert.throws(()=>executeUniversalPrimitiveOperation(created.artifact,{
  operation_ref:'op:sdk-closure:invalid',
  actor:{kind:'ai',ref:'agent:ibal'},
  operation:'CREATE',
  args:{patch_ref:'patch:closure',projection_refs:['projection:microsite'],primitive:invalid},
}),/CREATE_PRIMITIVE_INVALID:PRIMITIVE_SEMANTIC_TYPE/);
assert.deepEqual(created.artifact,beforeInvalid);

console.log(JSON.stringify({
  schema:'xiio.sdk.universal-primitive-closure-observation/v1',
  state:'PASS',
  owner_ref:'Vado42-chris/xi-io-sdk#168',
  framework_contract_ref:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_ref,
  framework_contract_blob_sha:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_blob_sha,
  primitive_ref:'p:class',
  semantic_type:'class',
  validation:true,
  create:true,
  article_template_rig:true,
  publisher_projection:true,
  reverse_readback:true,
  contradiction_rejected_before_mutation:true,
  runtime_acceptance:false,
  effect_authority:0,
}));
