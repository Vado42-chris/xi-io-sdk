const clone=v=>structuredClone(v);
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const slug=v=>text(v,'ID').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const arr=v=>Array.isArray(v)?v:[];

export function compileToolchestFlatpack(input={}){
  const product=text(input.product_ref,'PRODUCT_REF');
  const user=text(input.user_ref,'USER_REF');
  const generation=text(input.generation||'g1','GENERATION');
  const toolchestRef=text(input.toolchest_ref||`xiio:article/toolchest:${slug(product)}`,'TOOLCHEST_REF');
  const groups=arr(input.groups);
  if(!groups.length)throw new TypeError('GROUPS_REQUIRED');
  const groupRefs=new Set(), itemRefs=new Set(), primitives=[];
  const groupRows=groups.map((g,gi)=>{
    const groupRef=text(g.ref||`toolchest:group:${slug(g.label)}`,'GROUP_REF');
    if(groupRefs.has(groupRef))throw new TypeError('DUPLICATE_GROUP_REF'); groupRefs.add(groupRef);
    const children=arr(g.items).map((item,ii)=>{
      const ref=text(item.ref||`toolchest:item:${slug(item.label)}`,'ITEM_REF');
      if(itemRefs.has(ref)||groupRefs.has(ref))throw new TypeError('DUPLICATE_DESCENDANT_REF'); itemRefs.add(ref);
      primitives.push({
        identity:ref,semantic_type:'toolchest_item',
        coordinates:{value:ref,axis:['x','y','z'],scale:'5s',plane:'plane:toolchest',direction:'forward',orientation:'screen',projection:'article'},
        relationships:[groupRef],operations:['SELECT','INSPECT','TRANSFORM','MOVE','RESIZE'],
        provenance:{source:toolchestRef,generation},authority:{visibility:item.visibility||'PRIVATE',effect_ceiling:'READ_ONLY'},
        state:'CURRENT',version:generation,projection:['article','studio'],
        geometry:{x:0,y:ii*40,width:input.item_width||260,height:40},
        content:{text:text(item.label,'ITEM_LABEL'),description:String(item.description||'')},
        style:{},metadata:{order:ii,group_ref:groupRef,capability_ref:item.capability_ref||null}
      }); return ref;
    });
    primitives.push({
      identity:groupRef,semantic_type:'toolchest_group',
      coordinates:{value:groupRef,axis:['x','y','z'],scale:'5s',plane:'plane:toolchest',direction:'forward',orientation:'screen',projection:'article'},
      relationships:children,operations:['SELECT','INSPECT','TRANSFORM','MOVE','RESIZE'],
      provenance:{source:toolchestRef,generation},authority:{visibility:g.visibility||'PRIVATE',effect_ceiling:'READ_ONLY'},
      state:'CURRENT',version:generation,projection:['article','studio'],
      geometry:{x:0,y:gi*100,width:input.group_width||280,height:80},
      content:{text:text(g.label,'GROUP_LABEL')},style:{},metadata:{order:gi,child_refs:children}
    }); return {group_ref:groupRef,label:g.label,child_refs:children};
  });
  const allRefs=primitives.map(p=>p.identity);
  return {
    schema:'xiio.flatpack/v1',
    artifact:{artifact_ref:toolchestRef,version_ref:`${toolchestRef}@${generation}`,template_ref:'template:toolchest'},
    shared_flatplane:{plane_ref:'plane:toolchest',scale:'5s',domain_ref:'domain:toolchest',patch_refs:['patch:toolchest']},
    parametric_domain:{domain_ref:'domain:toolchest',axes:['x','y','z','order']},
    continuity_constraints:{adjacency:[],constraint_continuity:['identity','order'],stable_primitive_refs:true},
    local_control_patches:[{patch_ref:'patch:toolchest',plane_ref:'plane:toolchest',domain_window:{x:[0,1],y:[0,1]},primitive_refs:allRefs}],
    seam_equivalence:[],primitives,extrusions:[],
    projection_recipes:[{projection_ref:'projection:toolchest:studio',kind:'studio',artifact_ref:toolchestRef,primitive_refs:allRefs}],
    lineage:{source_generation:generation,parent_version_ref:null,digest:'PENDING_BINS_CUSTODY'},
    authority:{visibility:'PRIVATE',effect_ceiling:'READ_ONLY'},receipts:[],
    metadata:{
      article_ref:toolchestRef,user_ref:user,product_ref:product,groups:groupRows,
      variables:clone(input.variables||{}),responsive_rules:clone(input.responsive_rules||{narrow:'single-column',wide:'rail+content'}),
      contextual_tools:[],contextual_settings:[]
    }
  };
}

export function toolchestPunchcards(flatpack){
  if(flatpack?.schema!=='xiio.flatpack/v1')throw new TypeError('FLATPACK_REQUIRED');
  return flatpack.primitives.map(p=>({
    ref:p.identity,parent_article_ref:flatpack.metadata.article_ref,
    cells:{IDENTITY:1,SELECT:1,INSPECT:1,CONTENT:1,ORDER:1,VISIBILITY:1,CAPABILITY:1,RETURN:1}
  }));
}
