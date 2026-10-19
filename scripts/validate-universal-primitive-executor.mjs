#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  validateUniversalArtifact,executeUniversalPrimitiveOperation,resolveUniversalContextualTools,
  describeUniversalContextualTools,compileUniversalToolProjection,
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
  contextual_tools:[
    {tool_ref:'tool:text',name:'Typography',owner:'SDK',category:'Create & edit',description:'Edit the selected text directly on the same addressable primitive used by AI.',outcome:'Change words and typographic scale without forking the artifact.',admitted:true,public_safe:true,when_semantic_types:['heading'],operations:['TRANSFORM'],controls:[{control_ref:'control:text',label:'Text',kind:'textarea',binding:'content.text'},{control_ref:'control:font-size',label:'Size',kind:'number',binding:'style.fontSize'}],article:{title:'Typography',summary:'Direct text editing on one shared primitive.',tags:['text','wysiwyg']},publisher:{slug:'typography',route:'/tools/typography/',cta_label:'Explore typography',service_category:'Create & edit'}},
    {tool_ref:'tool:fake',owner:'UNKNOWN',admitted:false,when_semantic_types:[],operations:['EXECUTE']}
  ],
  contextual_settings:[{setting_ref:'setting:density',owner:'ARTICLES',admitted:true,value:'comfortable'}]}
};
assert.equal(validateUniversalArtifact(doc).ok,true);
// Same string-reference relationship rule as the canonical flatpack validator.
const related=structuredClone(doc);related.primitives[0].relationships=['p:image'];
assert.equal(validateUniversalArtifact(related).ok,true);
assert.deepEqual(extractUniversalTemplateRig(related).primitive_graph[0].relationships,['p:image']);
const unresolved=structuredClone(related);unresolved.primitives[0].relationships.push('p:unknown');
assert.equal(validateUniversalArtifact(unresolved).first_red,'PRIMITIVE_IDENTITY');
assert.throws(()=>extractUniversalTemplateRig(unresolved),/SOURCE_INVALID:PRIMITIVE_IDENTITY/);
assert.throws(()=>compileUniversalProjection(unresolved,'projection:microsite'),/SOURCE_INVALID:PRIMITIVE_IDENTITY/);
const missingRelationships=structuredClone(related);delete missingRelationships.primitives[0].relationships;
assert.equal(validateUniversalArtifact(missingRelationships).first_red,'PRIMITIVE_IDENTITY');
const normalizedCollision=structuredClone(related);
normalizedCollision.primitives.push({...structuredClone(related.primitives[0]),identity:' p:headline '});
assert.equal(validateUniversalArtifact(normalizedCollision).first_red,'PRIMITIVE_IDENTITY');
assert.equal(normalizedCollision.primitives.at(-1).identity,' p:headline ');
// Do not invent deduplication or typed-edge semantics absent from that contract.
const repeated=structuredClone(related);repeated.primitives[0].relationships.push('p:image');
assert.equal(validateUniversalArtifact(repeated).ok,true);
assert.deepEqual(extractUniversalTemplateRig(repeated).primitive_graph[0].relationships,['p:image','p:image']);
const unknownSeam=structuredClone(related);unknownSeam.seam_equivalence[0].state='UNKNOWN';
assert.equal(validateUniversalArtifact(unknownSeam).first_red,'SEAM_CONTINUITY');
assert.equal(unknownSeam.seam_equivalence[0].state,'UNKNOWN');
const human=executeUniversalPrimitiveOperation(doc,{operation_ref:'op:h1',actor:{kind:'human',ref:'person:owner'},primitive_ref:'p:headline',operation:'TRANSFORM',args:{path:'content.text',value:'Human edit'}});
const ai=executeUniversalPrimitiveOperation(human.artifact,{operation_ref:'op:a1',actor:{kind:'ai',ref:'agent:ibal'},primitive_ref:'p:headline',operation:'TRANSFORM',args:{path:'style.font_size',value:48}});
assert.equal(human.receipt.primitive_ref,ai.receipt.primitive_ref);
assert.equal(human.receipt.bins_digest_state,'PENDING_BINS_CUSTODY');
assert.equal(human.receipt.before_digest_ref,null);
assert.equal(ai.receipt.after_digest_ref,null);
const created=executeUniversalPrimitiveOperation(ai.artifact,{operation_ref:'op:h:create',actor:{kind:'human',ref:'person:owner'},operation:'CREATE',args:{patch_ref:'patch:a',projection_refs:['projection:microsite','projection:hex'],primitive:primitive('p:new','paragraph')}});
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
assert.equal(z2.tools[0].name,'Typography');
assert.equal(z2.tools[0].description.startsWith('Edit the selected text'),true);
assert.equal(z2.tools[0].controls[0].binding,'content.text');
const described=describeUniversalContextualTools(deleted.artifact,['p:headline']);
assert.equal(described.schema,'xiio.sdk.contextual-tool-description/v1');
assert.equal(described.tools[0].publisher.service_category,'Create & edit');
const toolProjection=compileUniversalToolProjection(deleted.artifact,'tool:text','microsite');
assert.equal(toolProjection.schema,'xiio.sdk.publisher-tool-projection/v1');
assert.equal(toolProjection.tool.tool_ref,'tool:text');
assert.equal(toolProjection.tool.article.title,'Typography');
assert.equal(toolProjection.effect_ceiling,0);
const rig=extractUniversalTemplateRig(deleted.artifact);
assert.equal(rig.primitive_graph.length,3);
assert.equal(rig.slots.length,2);
assert.equal(rig.projection_recipes.length,2);
const projection=compileUniversalProjection(deleted.artifact,'projection:microsite');
assert.ok(projection.primitive_refs.includes('p:new'));
assert.equal(reverseUniversalProjectionReadback(deleted.artifact,projection).same_source_ids,true);
assert.equal(projection.lineage.source_generation,'fixture:g1');
const sourceBeforeReadback=structuredClone(deleted.artifact),projectionBeforeReadback=structuredClone(projection);
const readbackHostiles=[
 ['empty claimed denominator',p=>{p.primitive_refs=[];p.blocks=[];}],
 ['omitted primitive',p=>{p.primitive_refs.pop();p.blocks.pop();}],
 ['duplicate primitive',p=>p.primitive_refs.push(p.primitive_refs[0])],
 ['unknown primitive',p=>p.primitive_refs.push('p:unknown')],
 ['missing refs',p=>{delete p.primitive_refs;}],
 ['missing blocks',p=>{delete p.blocks;}],
 ['omitted block',p=>p.blocks.pop()],
 ['duplicate block',p=>p.blocks.push(structuredClone(p.blocks[0]))],
 ['unknown block',p=>{p.blocks[0].primitive_ref='p:unknown';}],
 ['unknown recipe',p=>{p.projection_ref='projection:unknown';}],
 ['wrong kind',p=>{p.projection_kind='hex';}],
 ['wrong schema',p=>{p.schema='xiio.sdk.publisher-tool-projection/v1';}],
 ['wrong artifact',p=>{p.artifact_ref='artifact:other';}],
 ['wrong template',p=>{p.template_rig_ref='template:other';}],
 ['wrong Article route',p=>{p.article_ref='article:other';}],
 ['forged effect ceiling',p=>{p.effect_ceiling=100;}],
 ['forged Bins custody',p=>{p.lineage.bins_digest_state='VERIFIED';}],
 ['missing lineage',p=>{delete p.lineage;}],
 ['stale version',p=>{p.lineage.version_ref='version:one@0';}],
 ['stale generation',p=>{p.lineage.source_generation='fixture:g0';}],
 ['missing generation',p=>{delete p.lineage.source_generation;}],
 ['stale source digest',p=>{p.lineage.source_digest_ref='stale';}],
 ['missing source digest',p=>{delete p.lineage.source_digest_ref;}],
 ['source version advanced',()=>{},s=>{s.artifact.version_ref='version:one@2';}],
 ['source generation advanced',()=>{},s=>{s.lineage.source_generation='fixture:g2';}],
 ['source digest advanced',()=>{},s=>{s.lineage.digest='fixture:g2';}],
 ['source identity collision',()=>{},s=>s.primitives.push(structuredClone(s.primitives[0]))],
 ['source unknown relationship target',()=>{},s=>{s.primitives[0].relationships=['p:unknown'];}],
 ['source missing relationships',()=>{},s=>{delete s.primitives[0].relationships;}],
 ['source normalized identity collision',()=>{},s=>s.primitives.push({...structuredClone(s.primitives[0]),identity:' p:headline '})],
 ['ambiguous recipe',()=>{},s=>s.projection_recipes.push(structuredClone(s.projection_recipes[0]))],
 ['private source',()=>{},s=>{s.authority.visibility='PRIVATE';}],
 ['private selected primitive',()=>{},s=>{s.primitives[0].authority.visibility='PRIVATE';}]
];
for(const [name,changeProjection,changeSource=()=>{}] of readbackHostiles){
 const p=structuredClone(projection),s=structuredClone(deleted.artifact);
 changeProjection(p);changeSource(s);
 const result=reverseUniversalProjectionReadback(s,p);
 assert.equal(result.ok,false,name);assert.equal(result.same_source_ids,false,name);
 assert.ok(result.first_red,name);assert.equal(result.effect_ceiling,0,name);
 assert.equal(result.version_ref,p.lineage?.version_ref??null,name);
}
const reordered=structuredClone(projection);reordered.primitive_refs.reverse();reordered.blocks.reverse();
assert.equal(reverseUniversalProjectionReadback(deleted.artifact,reordered).ok,true);
const subset=structuredClone(deleted.artifact);
subset.projection_recipes[0].primitive_refs=['p:headline'];
subset.primitives.find(p=>p.identity==='p:image').authority.visibility='PRIVATE';
subset.primitives[0].relationships=['p:image'];
const subsetProjection=compileUniversalProjection(subset,'projection:microsite');
assert.equal(reverseUniversalProjectionReadback(subset,subsetProjection).ok,true);
assert.equal(JSON.stringify(subsetProjection).includes('p:image'),false);
assert.deepEqual(extractUniversalTemplateRig(subset).primitive_graph[0].relationships,['p:image']);
const expandedSubset=structuredClone(subsetProjection);
expandedSubset.primitive_refs.push('p:new');expandedSubset.blocks.push(projection.blocks.find(b=>b.primitive_ref==='p:new'));
assert.equal(reverseUniversalProjectionReadback(subset,expandedSubset).ok,false);
const empty=structuredClone(deleted.artifact);empty.projection_recipes[0].primitive_refs=[];
assert.equal(reverseUniversalProjectionReadback(empty,compileUniversalProjection(empty,'projection:microsite')).ok,true);
assert.equal(reverseUniversalProjectionReadback(deleted.artifact,compileUniversalProjection(deleted.artifact,'projection:hex')).ok,true);
const pendingDigest=structuredClone(deleted.artifact);pendingDigest.lineage.digest=null;
const pendingProjection=compileUniversalProjection(pendingDigest,'projection:microsite');
assert.equal(reverseUniversalProjectionReadback(pendingDigest,pendingProjection).ok,true);
assert.equal(pendingProjection.lineage.bins_digest_state,'PENDING_BINS_CUSTODY');
assert.deepEqual(deleted.artifact,sourceBeforeReadback);assert.deepEqual(projection,projectionBeforeReadback);
const privateArtifact=structuredClone(deleted.artifact);privateArtifact.authority.visibility='PRIVATE';
assert.throws(()=>compileUniversalProjection(privateArtifact,'projection:microsite'),/VISIBILITY_NOT_PUBLIC/);
const privateNode=structuredClone(deleted.artifact);privateNode.primitives[0].authority.visibility='PRIVATE';
assert.throws(()=>compileUniversalProjection(privateNode,'projection:microsite'),/PRIMITIVE_VISIBILITY_NOT_PUBLIC/);
assert.throws(()=>executeUniversalPrimitiveOperation(doc,{operation_ref:'op:bad',actor:{kind:'ai',ref:'agent:ibal'},primitive_ref:'p:headline',operation:'TRANSFORM',args:{path:'identity',value:'fork'}}),/TRANSFORM_PATH_NOT_ADMITTED/);
console.log(JSON.stringify({schema:'xiio.sdk.universal-primitive-executor-check/v1',state:'PASS',shared_plane:'5s',human_ai_same_ids:true,template_rig:true,contextual_z2:true,self_describing_tools:true,tool_publisher_projection:true,publisher_projection:true,reverse_readback_same_ids:true,reverse_readback_recipe_lineage_hostiles:readbackHostiles.length,public_subset_preserved:true,visibility_before_render:true,unadmitted_tools_hidden:true,editor_ops:'CREATE_DUPLICATE_ORDER_DELETE',z_not_order:true,bins_digest_authority:'PENDING_BINS_CUSTODY',browser_safe:true,effects:0}));
