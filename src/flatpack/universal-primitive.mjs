const clone=v=>structuredClone(v);
const list=v=>Array.isArray(v)?v:[];

export function validateUniversalArtifact(doc){
  const fail=(first_red,detail)=>({ok:false,schema:'xiio.sdk.universal-artifact-validation/v1',first_red,detail,effect_authority:0});
  if(!doc||typeof doc!=='object'||Array.isArray(doc)) return fail('ARTIFACT_IDENTITY','artifact must be object');
  if(doc.schema!=='xiio.flatpack/v1') return fail('ARTIFACT_IDENTITY','schema must be xiio.flatpack/v1');
  const artifactRef=String(doc.artifact?.artifact_ref||'').trim();
  if(!artifactRef) return fail('ARTIFACT_IDENTITY','artifact_ref required');
  const planeRef=String(doc.shared_flatplane?.plane_ref||'').trim();
  if(!planeRef||doc.shared_flatplane?.scale!=='5s') return fail('SHARED_PLANE','one shared plane at 5s required');
  const patches=list(doc.local_control_patches);
  const patchRefs=new Set();
  for(const p of patches){
    if(!p?.patch_ref||p.plane_ref!==planeRef) return fail('PATCH_BINDING',`patch must bind shared plane:${p?.patch_ref||'missing'}`);
    if(patchRefs.has(p.patch_ref)) return fail('PATCH_BINDING',`duplicate patch:${p.patch_ref}`);
    patchRefs.add(p.patch_ref);
  }
  const declared=new Set(list(doc.shared_flatplane?.patch_refs));
  if(declared.size!==patchRefs.size||[...patchRefs].some(x=>!declared.has(x))) return fail('PATCH_BINDING','patch_refs mismatch');
  const seamPairs=new Set();
  for(const s of list(doc.seam_equivalence)){
    if(!patchRefs.has(s?.left_patch_ref)||!patchRefs.has(s?.right_patch_ref)||s?.state!=='PASS') return fail('SEAM_CONTINUITY',`seam not PASS:${s?.seam_ref||'missing'}`);
    seamPairs.add([s.left_patch_ref,s.right_patch_ref].sort().join('::'));
  }
  for(const pair of list(doc.continuity_constraints?.adjacency)){
    if(!Array.isArray(pair)||pair.length!==2||!seamPairs.has([...pair].sort().join('::'))) return fail('SEAM_CONTINUITY','adjacency lacks PASS seam');
  }
  const ids=new Set();
  for(const p of list(doc.primitives)){
    if(!p?.identity||ids.has(p.identity)) return fail('PRIMITIVE_IDENTITY',`invalid primitive identity:${p?.identity||'missing'}`);
    ids.add(p.identity);
  }
  for(const p of patches) for(const id of list(p.primitive_refs)) if(!ids.has(id)) return fail('PRIMITIVE_IDENTITY',`patch ref unresolved:${id}`);
  for(const x of list(doc.extrusions)){
    if(!patchRefs.has(x?.patch_ref)||!ids.has(x?.primitive_ref)) return fail('EXTRUSION_IDENTITY','extrusion ref unresolved');
  }
  for(const r of list(doc.projection_recipes)){
    if(r?.artifact_ref!==artifactRef) return fail('PROJECTION_IDENTITY','projection artifact identity fork');
    for(const id of list(r.primitive_refs)) if(!ids.has(id)) return fail('PROJECTION_IDENTITY',`projection ref unresolved:${id}`);
  }
  if(!doc.authority?.visibility||doc.authority?.effect_ceiling===undefined) return fail('AUTHORITY','visibility/effect ceiling required');
  return {ok:true,schema:'xiio.sdk.universal-artifact-validation/v1',artifact_ref:artifactRef,shared_plane_ref:planeRef,scale:'5s',primitive_count:ids.size,identity_preserved:true,effect_authority:0,first_red:null};
}

function primitiveById(doc,id){
  const p=list(doc.primitives).find(x=>x.identity===id);
  if(!p) throw new Error(`PRIMITIVE_NOT_FOUND:${id}`);
  return p;
}
function setPath(target,path,value){
  const parts=String(path).split('.');
  if(!new Set(['content','geometry','style','metadata']).has(parts[0])) throw new Error(`TRANSFORM_PATH_NOT_ADMITTED:${path}`);
  let cursor=target;
  for(const key of parts.slice(0,-1)) cursor=cursor[key]??={};
  cursor[parts.at(-1)]=value;
}
export function executeUniversalPrimitiveOperation(source,command){
  const before=validateUniversalArtifact(source);
  if(!before.ok) throw new Error(`SOURCE_INVALID:${before.first_red}`);
  if(!command?.actor||!['human','ai'].includes(command.actor.kind)||!command.actor.ref) throw new Error('ACTOR_INVALID');
  const doc=clone(source);
  const artifactId=doc.artifact.artifact_ref;
  let primitiveId=command.primitive_ref||null;

  if(command.operation==='CREATE'){
    const p=clone(command.args?.primitive);
    const patchRef=command.args?.patch_ref;
    if(!p?.identity||!patchRef) throw new Error('CREATE_REQUIRES_PRIMITIVE_AND_PATCH_REF');
    if(list(doc.primitives).some(x=>x.identity===p.identity)) throw new Error(`PRIMITIVE_ALREADY_EXISTS:${p.identity}`);
    const patch=list(doc.local_control_patches).find(x=>x.patch_ref===patchRef);
    if(!patch) throw new Error(`PATCH_NOT_FOUND:${patchRef}`);
    doc.primitives.push(p);patch.primitive_refs=[...list(patch.primitive_refs),p.identity];
    for(const projectionRef of list(command.args?.projection_refs)){
      const recipe=list(doc.projection_recipes).find(r=>r.projection_ref===projectionRef);
      if(!recipe) throw new Error(`PROJECTION_NOT_FOUND:${projectionRef}`);
      recipe.primitive_refs=[...list(recipe.primitive_refs),p.identity];
    }
    primitiveId=p.identity;
  } else {
    const p=primitiveById(doc,command.primitive_ref);
    if(!list(p.operations).includes(command.operation)) throw new Error(`OPERATION_NOT_ADMITTED:${command.operation}`);
    primitiveId=p.identity;
    if(command.operation==='MOVE') p.geometry={...(p.geometry||{}),x:command.args?.x,y:command.args?.y};
    else if(command.operation==='RESIZE') p.geometry={...(p.geometry||{}),width:command.args?.width,height:command.args?.height};
    else if(command.operation==='TRANSFORM') setPath(p,command.args?.path,command.args?.value);
    else if(command.operation==='DUPLICATE'){
      const newId=String(command.args?.new_identity||'').trim();
      if(!newId) throw new Error('DUPLICATE_REQUIRES_NEW_IDENTITY');
      if(list(doc.primitives).some(x=>x.identity===newId)) throw new Error(`PRIMITIVE_ALREADY_EXISTS:${newId}`);
      const copy=clone(p);copy.identity=newId;copy.relationships=list(copy.relationships).filter(x=>x!==p.identity);
      doc.primitives.push(copy);
      for(const patch of list(doc.local_control_patches)) if(list(patch.primitive_refs).includes(p.identity)) patch.primitive_refs.push(newId);
      primitiveId=newId;
    } else if(command.operation==='DELETE'){
      doc.primitives=doc.primitives.filter(x=>x.identity!==p.identity);
      for(const patch of list(doc.local_control_patches)) patch.primitive_refs=list(patch.primitive_refs).filter(x=>x!==p.identity);
      doc.extrusions=list(doc.extrusions).filter(x=>x.primitive_ref!==p.identity);
      for(const recipe of list(doc.projection_recipes)) recipe.primitive_refs=list(recipe.primitive_refs).filter(x=>x!==p.identity);
      for(const other of list(doc.primitives)) other.relationships=list(other.relationships).filter(x=>x!==p.identity);
    } else if(!['SELECT','INSPECT'].includes(command.operation)) throw new Error(`EXECUTOR_OPERATION_NOT_IMPLEMENTED:${command.operation}`);
  }

  if(doc.artifact.artifact_ref!==artifactId) throw new Error('IDENTITY_MUTATION_FORBIDDEN');
  const after=validateUniversalArtifact(doc);
  if(!after.ok) throw new Error(`RESULT_INVALID:${after.first_red}`);
  const receipt={schema:'xiio.sdk.primitive-operation-receipt/v1',operation_ref:command.operation_ref,actor:command.actor,primitive_ref:primitiveId,artifact_ref:artifactId,operation:command.operation,bins_digest_state:'PENDING_BINS_CUSTODY',before_digest_ref:null,after_digest_ref:null,effect_ceiling:0};
  doc.receipts=[...list(doc.receipts),receipt];
  return {artifact:doc,receipt};
}

export function resolveUniversalContextualTools(doc,selectionRefs=[]){
  const semantic=new Set(selectionRefs.map(id=>primitiveById(doc,id).semantic_type));
  const tools=list(doc.metadata?.contextual_tools).filter(t=>t.admitted===true&&(list(t.when_semantic_types).length===0||list(t.when_semantic_types).some(x=>semantic.has(x))));
  return {schema:'xiio.sdk.contextual-tool-runtime/v1',plane:'Z2',artifact_ref:doc.artifact.artifact_ref,primitive_selection_refs:selectionRefs,tools:clone(tools),effect_ceiling:0};
}

export function extractUniversalTemplateRig(doc){
  const v=validateUniversalArtifact(doc); if(!v.ok) throw new Error(`SOURCE_INVALID:${v.first_red}`);
  return {schema:'xiio.sdk.template-rig-runtime/v1',template_ref:doc.artifact.template_ref,artifact_ref:doc.artifact.artifact_ref,
    primitive_graph:list(doc.primitives).map(p=>({primitive_ref:p.identity,semantic_type:p.semantic_type,relationships:clone(p.relationships||[])})),
    constraints:clone(doc.continuity_constraints||{}),
    slots:list(doc.local_control_patches).map(p=>({slot_ref:p.patch_ref,plane_ref:p.plane_ref,primitive_refs:clone(p.primitive_refs||[])})),
    relationships:clone(doc.seam_equivalence||[]),defaults:clone(doc.metadata?.template_defaults||{}),responsive_rules:clone(doc.metadata?.responsive_rules||{}),
    contextual_tools:clone(doc.metadata?.contextual_tools||[]),contextual_settings:clone(doc.metadata?.contextual_settings||[]),
    projection_recipes:list(doc.projection_recipes).map(r=>({projection_ref:r.projection_ref,kind:r.kind,primitive_refs:clone(r.primitive_refs||[])})),effect_ceiling:0};
}

export function compileUniversalProjection(doc,projectionRef){
  const v=validateUniversalArtifact(doc); if(!v.ok) throw new Error(`SOURCE_INVALID:${v.first_red}`);
  const recipe=list(doc.projection_recipes).find(r=>r.projection_ref===projectionRef);
  if(!recipe) throw new Error(`PROJECTION_NOT_FOUND:${projectionRef}`);
  if(doc.authority.visibility!=='PUBLIC') throw new Error('VISIBILITY_NOT_PUBLIC');
  const blocks=recipe.primitive_refs.map(id=>{const p=primitiveById(doc,id); if(p.authority?.visibility!=='PUBLIC') throw new Error(`PRIMITIVE_VISIBILITY_NOT_PUBLIC:${id}`); return {primitive_ref:p.identity,semantic_type:p.semantic_type,geometry:clone(p.geometry||{}),content:clone(p.content||{}),style:clone(p.style||{}),metadata:clone(p.metadata||{})};});
  return {schema:'xiio.sdk.publisher-projection-candidate/v1',projection_ref:recipe.projection_ref,projection_kind:recipe.kind,artifact_ref:doc.artifact.artifact_ref,article_ref:doc.metadata?.article_ref,template_rig_ref:doc.artifact.template_ref,primitive_refs:clone(recipe.primitive_refs),blocks,lineage:{version_ref:doc.artifact.version_ref,source_digest_ref:doc.lineage?.digest||null,bins_digest_state:'PENDING_BINS_CUSTODY'},effect_ceiling:0};
}

export function reverseUniversalProjectionReadback(source,projection){
  const ids=new Set(list(source.primitives).map(p=>p.identity));
  const refs=list(projection.primitive_refs),missing=refs.filter(id=>!ids.has(id));
  const ok=projection.artifact_ref===source.artifact.artifact_ref&&missing.length===0;
  return {schema:'xiio.sdk.publisher-reverse-readback/v1',ok,projection_ref:projection.projection_ref,artifact_ref:projection.artifact_ref,article_ref:projection.article_ref,primitive_refs:refs,version_ref:source.artifact.version_ref,missing_primitive_refs:missing,same_source_ids:ok,effect_ceiling:0};
}
