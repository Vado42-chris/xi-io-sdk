#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  validateUniversalArtifact,executeUniversalPrimitiveOperation,resolveUniversalContextualTools,
  extractUniversalTemplateRig,compileUniversalProjection,reverseUniversalProjectionReadback
} from '../src/flatpack/universal-primitive.mjs';

const ops=['SELECT','INSPECT','MOVE','RESIZE','TRANSFORM','DUPLICATE','DELETE'];
const primitive=(identity,semantic_type)=>({identity,semantic_type,coordinates:{value:identity,axis:['x','y','z'],scale:'5s',plane:'plane:one',direction:'forward',orientation:'screen',projection:'article'},relationships:[],operations:ops,provenance:{source:'fixture'},authority:{visibility:'PUBLIC',effect_ceiling:'READ_ONLY'},state:'CURRENT',version:'1',projection:['article','microsite'],geometry:{x:0,y:0,width:100,height:40},content:{text:identity},style:{}});
const doc={
 schema:'xiio.flatpack/v1',
 artifact:{artifact_ref:'artifact:one',version_ref:'version:one@1',template_ref:'template:one'},
 shared_flatplane:{plane_ref:'plane:one',scale:'5s',domain_ref:'domain:one',patch_refs:['patch:a','patch:b']},
 parametric_domain:{domain_ref:'domain:one',axes:['x','y','z','order']},
 continuity_constraints:{adjacency:[['patch:a','patch:b']],constraint_continuity:['position'],stable_primitive_refs:true},
 local_control_patches:[
  {patch_ref:'patch:a',plane_ref:'plane:one',domain_window:{x:[0,.5],y:[0,1]},primitive_refs:['p:headline']},
  {patch_ref:'patch:b',plane_ref:'plane:one',domain_window:{x:[.5,1],y:[0,1]},primitive_refs:['p:image']}
 ],
 seam_equivalence:[{seam_ref:'seam:a-b',left_patch_ref:'patch:a',right_patch_ref:'patch:b',shared_boundary:{axis:'x',value:.5},state:'PASS'}],
 primitives:[primitive('p:headline','heading'),primitive('p:image','image')],
 extrusions:[{extrusion_ref:'x:image',patch_ref:'patch:b',primitive_ref:'p:image',z_depth:1,orientation:'screen',direction:'positive'}],
 projection_recipes:[
  {projection_ref:'projection:microsite',kind:'microsite',artifact_ref:'artifact:one',primitive_refs:['p:headline','p:image']},
  {projection_ref:'projection:hex',kind:'hex',artifact_ref:'artifact:one',primitive_refs:['p:headline','p:image']}
 ],
 lineage:{source_generation:'fixture:g1',parent_version_ref:null,digest:'fixture'},
 authority:{visibility:'PUBLIC',effect_ceiling:'READ_ONLY'},receipts:[],
 metadata:{article_ref:'article:one',template_defaults:{density:'comfortable'},responsive_rules:{narrow:'stack',wide:'columns'},
  contextual_tools:[{tool_ref:'tool:text',owner:'SDK',admitted:true,when_semantic_types:['heading'],operations:['TRANSFORM']},{tool_ref:'tool:fake',owner:'UNKNOWN',admitted:false,when_semantic_types:[],operations:['EXECUTE']}],
  contextual_settings:[{setting_ref:'setting:density',owner:'ARTICLES',admitted:true,value:'comfortable'}]}
};
assert.equal(validateUniversalArtifact(doc).ok,true);
const human=executeUniversalPrimitiveOperation(doc,{operation_ref:'op:h1',actor:{kind:'human',ref:'person:owner'},primitive_ref:'p:headline',operation:'TRANSFORM',args:{path:'content.text',value:'Human edit'}});
const ai=executeUniversalPrimitiveOperation(human.artifact,{operation_ref:'op:a1',actor:{kind:'ai',ref:'agent:ibal'},primitive_ref:'p:headline',operation:'TRANSFORM',args:{path:'style.font_size',value:48}});
assert.equal(human.receipt.primitive_ref,ai.receipt.primitive_ref);
assert.equal(human.receipt.bins_digest_state,'PENDING_BINS_CUSTODY');
assert.equal(human.receipt.before_digest_ref,null);
assert.equal(ai.receipt.after_digest_ref,null);
const created=executeUniversalPrimitiveOperation(ai.artifact,{operation_ref:'op:h:create',actor:{kind:'human',ref:'person:owner'},operation:'CREATE',args:{patch_ref:'patch:a',primitive:primitive('p:new','paragraph')}});
assert.ok(created.artifact.primitives.some(x=>x.identity==='p:new'));
const duplicated=executeUniversalPrimitiveOperation(created.artifact,{operation_ref:'op:a:duplicate',actor:{kind:'ai',ref:'agent:ibal'},primitive_ref:'p:new',operation:'DUPLICATE',args:{new_identity:'p:new-copy'}});
assert.ok(duplicated.artifact.primitives.some(x=>x.identity==='p:new-copy'));
const ordered=executeUniversalPrimitiveOperation(duplicated.artifact,{operation_ref:'op:h:order',actor:{kind:'human',ref:'person:owner'},primitive_ref:'p:new-copy',operation:'TRANSFORM',args:{path:'metadata.order',value:7}});
assert.equal(ordered.artifact.primitives.find(x=>x.identity==='p:new-copy').metadata.order,7);
assert.equal(ordered.artifact.primitives.find(x=>x.identity==='p:new-copy').extrusion_z,undefined);
const deleted=executeUniversalPrimitiveOperation(ordered.artifact,{operation_ref:'op:a:delete',actor:{kind:'ai',ref:'agent:ibal'},primitive_ref:'p:new-copy',operation:'DELETE'});
assert.equal(deleted.artifact.primitives.some(x=>x.identity==='p:new-copy'),false);
const z2=resolveUniversalContextualTools(deleted.artifact,['p:headline']);
assert.deepEqual(z2.tools.map(x=>x.tool_ref),['tool:text']);
const rig=extractUniversalTemplateRig(deleted.artifact);
assert.equal(rig.primitive_graph.length,2);
assert.equal(rig.slots.length,2);
assert.equal(rig.projection_recipes.length,2);
const projection=compileUniversalProjection(deleted.artifact,'projection:microsite');
assert.equal(reverseUniversalProjectionReadback(deleted.artifact,projection).same_source_ids,true);
const privateArtifact=structuredClone(deleted.artifact);privateArtifact.authority.visibility='PRIVATE';
assert.throws(()=>compileUniversalProjection(privateArtifact,'projection:microsite'),/VISIBILITY_NOT_PUBLIC/);
const privateNode=structuredClone(deleted.artifact);privateNode.primitives[0].authority.visibility='PRIVATE';
assert.throws(()=>compileUniversalProjection(privateNode,'projection:microsite'),/PRIMITIVE_VISIBILITY_NOT_PUBLIC/);
assert.throws(()=>executeUniversalPrimitiveOperation(doc,{operation_ref:'op:bad',actor:{kind:'ai',ref:'agent:ibal'},primitive_ref:'p:headline',operation:'TRANSFORM',args:{path:'identity',value:'fork'}}),/TRANSFORM_PATH_NOT_ADMITTED/);
console.log(JSON.stringify({schema:'xiio.sdk.universal-primitive-executor-check/v1',state:'PASS',shared_plane:'5s',human_ai_same_ids:true,template_rig:true,contextual_z2:true,publisher_projection:true,reverse_readback_same_ids:true,visibility_before_render:true,unadmitted_tools_hidden:true,editor_ops:'CREATE_DUPLICATE_ORDER_DELETE',z_not_order:true,bins_digest_authority:'PENDING_BINS_CUSTODY',browser_safe:true,effects:0}));
