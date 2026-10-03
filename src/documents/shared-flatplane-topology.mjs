export const SHARED_FLATPLANE_TOPOLOGY_SCHEMA='xiio.sdk.shared-flatplane-topology/v1';
export const SHARED_FLATPLANE_SCALE='5s';

const text=(v,k,max=1024)=>{
  if(typeof v!=='string'||!v.trim()||v.trim().length>max) throw new TypeError(k+'_INVALID');
  return v.trim();
};
const optional=(v,max=1024)=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():null;
const arr=(v,k)=>{ if(!Array.isArray(v)) throw new TypeError(k+'_INVALID'); return v; };
const obj=(v,k)=>{ if(!v||typeof v!=='object'||Array.isArray(v)) throw new TypeError(k+'_INVALID'); return v; };
const unique=(values,k)=>{
  const seen=new Set();
  for(const value of values){
    if(seen.has(value)) throw new TypeError(k+'_DUPLICATE:'+value);
    seen.add(value);
  }
  return values;
};
const freeze=(v)=>Object.freeze(v);

function normalizedRefs(values,k){
  return unique(arr(values,k).map((v,i)=>text(v,`${k}_${i}`)),k);
}

function rejectPrivatePlaneCarrier(row,kind){
  if(Object.prototype.hasOwnProperty.call(row,'shared_flatplane')){
    throw new TypeError(kind+'_MINTS_PRIVATE_PLANE');
  }
}

export function SharedFlatplaneTopology(input={}){
  const artifact_ref=text(input.artifact_ref,'artifact_ref');
  const flatplane=obj(input.shared_flatplane,'shared_flatplane');
  const plane_ref=text(flatplane.plane_ref,'plane_ref');
  const scale=text(flatplane.scale||SHARED_FLATPLANE_SCALE,'flatplane_scale');
  if(scale.toLowerCase()!==SHARED_FLATPLANE_SCALE) throw new TypeError('SHARED_FLATPLANE_SCALE_INVALID');

  const parametric_domain=obj(flatplane.parametric_domain,'parametric_domain');
  const domain_ref=text(parametric_domain.domain_ref,'domain_ref');
  const domain_axes=normalizedRefs(parametric_domain.axes||[],'domain_axes');
  if(domain_axes.length<2) throw new TypeError('PARAMETRIC_DOMAIN_REQUIRES_AT_LEAST_TWO_AXES');

  const primitiveRows=arr(input.primitives,'primitives').map((row,i)=>{
    obj(row,`primitive_${i}`);
    rejectPrivatePlaneCarrier(row,'PRIMITIVE');
    const primitive_ref=text(row.primitive_ref,`primitive_ref_${i}`);
    return freeze({
      primitive_ref,
      semantic_type:text(row.semantic_type,`primitive_semantic_type_${i}`),
      coordinates:freeze({...obj(row.coordinates??{},`primitive_coordinates_${i}`)}),
      relationships:freeze([...arr(row.relationships??[],`primitive_relationships_${i}`)]),
      operations:freeze([...arr(row.operations??[],`primitive_operations_${i}`)]),
      version:Number.isInteger(row.version)&&row.version>=0?row.version:0,
      provenance_ref:optional(row.provenance_ref),
    });
  });
  if(!primitiveRows.length) throw new TypeError('PRIMITIVES_REQUIRED');
  const primitiveRefs=unique(primitiveRows.map(x=>x.primitive_ref),'primitive_ref');

  const patchRows=arr(input.local_control_patches,'local_control_patches').map((row,i)=>{
    obj(row,`patch_${i}`);
    rejectPrivatePlaneCarrier(row,'PATCH');
    const patch_ref=text(row.patch_ref,`patch_ref_${i}`);
    const rowPlane=text(row.plane_ref,`patch_plane_ref_${i}`);
    if(rowPlane!==plane_ref) throw new TypeError('PATCH_PLANE_REF_MUST_EQUAL_SHARED_PLANE');
    const refs=normalizedRefs(row.primitive_refs||[],`patch_primitive_refs_${i}`);
    for(const ref of refs) if(!primitiveRefs.includes(ref)) throw new TypeError('PATCH_REFERENCES_UNKNOWN_PRIMITIVE:'+ref);
    return freeze({
      patch_ref,
      plane_ref:rowPlane,
      primitive_refs:freeze(refs),
      local_domain:freeze({...obj(row.local_domain??{},`patch_local_domain_${i}`)}),
    });
  });
  if(!patchRows.length) throw new TypeError('LOCAL_CONTROL_PATCHES_REQUIRED');
  const patchRefs=unique(patchRows.map(x=>x.patch_ref),'patch_ref');

  const seamRows=arr(input.seam_equivalence,'seam_equivalence').map((row,i)=>{
    obj(row,`seam_${i}`);
    const seam_ref=text(row.seam_ref,`seam_ref_${i}`);
    const left_patch_ref=text(row.left_patch_ref,`left_patch_ref_${i}`);
    const right_patch_ref=text(row.right_patch_ref,`right_patch_ref_${i}`);
    if(!patchRefs.includes(left_patch_ref)||!patchRefs.includes(right_patch_ref)) throw new TypeError('SEAM_REFERENCES_UNKNOWN_PATCH');
    if(left_patch_ref===right_patch_ref) throw new TypeError('SEAM_REQUIRES_DISTINCT_PATCHES');
    return freeze({
      seam_ref,
      left_patch_ref,
      right_patch_ref,
      continuity_ref:text(row.continuity_ref,`continuity_ref_${i}`),
    });
  });
  const seamRefs=unique(seamRows.map(x=>x.seam_ref),'seam_ref');

  const continuityRows=arr(input.continuity_constraints,'continuity_constraints').map((row,i)=>{
    obj(row,`continuity_${i}`);
    const continuity_ref=text(row.continuity_ref,`continuity_ref_${i}`);
    const seam_refs=normalizedRefs(row.seam_refs||[],`continuity_seam_refs_${i}`);
    for(const ref of seam_refs) if(!seamRefs.includes(ref)) throw new TypeError('CONTINUITY_REFERENCES_UNKNOWN_SEAM:'+ref);
    return freeze({
      continuity_ref,
      seam_refs:freeze(seam_refs),
      class:text(row.class,`continuity_class_${i}`),
      tolerance:row.tolerance??null,
    });
  });
  const continuityRefs=unique(continuityRows.map(x=>x.continuity_ref),'continuity_ref');
  for(const seam of seamRows) if(!continuityRefs.includes(seam.continuity_ref)) throw new TypeError('SEAM_CONTINUITY_REF_UNKNOWN:'+seam.continuity_ref);

  const extrusionRows=arr(input.extrusions,'extrusions').map((row,i)=>{
    obj(row,`extrusion_${i}`);
    rejectPrivatePlaneCarrier(row,'EXTRUSION');
    const extrusion_ref=text(row.extrusion_ref,`extrusion_ref_${i}`);
    const rowPlane=text(row.plane_ref,`extrusion_plane_ref_${i}`);
    if(rowPlane!==plane_ref) throw new TypeError('EXTRUSION_PLANE_REF_MUST_EQUAL_SHARED_PLANE');
    const primitive_ref=text(row.primitive_ref,`extrusion_primitive_ref_${i}`);
    if(!primitiveRefs.includes(primitive_ref)) throw new TypeError('EXTRUSION_REFERENCES_UNKNOWN_PRIMITIVE:'+primitive_ref);
    const local_cube_ref=text(row.local_cube_ref,`local_cube_ref_${i}`);
    return freeze({
      extrusion_ref,
      plane_ref:rowPlane,
      primitive_ref,
      local_cube_ref,
      local_z:row.local_z??null,
      orientation:row.orientation??null,
      direction:row.direction??null,
    });
  });
  const extrusionRefs=unique(extrusionRows.map(x=>x.extrusion_ref),'extrusion_ref');

  const projectionRecipes=arr(input.projection_recipes,'projection_recipes').map((row,i)=>{
    obj(row,`projection_${i}`);
    return freeze({
      projection_ref:text(row.projection_ref,`projection_ref_${i}`),
      target:text(row.target,`projection_target_${i}`),
      primitive_refs:freeze(normalizedRefs(row.primitive_refs||primitiveRefs,`projection_primitive_refs_${i}`)),
      effect_authority:row.effect_authority??0,
    });
  });
  unique(projectionRecipes.map(x=>x.projection_ref),'projection_ref');
  for(const recipe of projectionRecipes){
    for(const ref of recipe.primitive_refs) if(!primitiveRefs.includes(ref)) throw new TypeError('PROJECTION_REFERENCES_UNKNOWN_PRIMITIVE:'+ref);
  }

  const lineage=obj(input.lineage,'lineage');
  const authority=obj(input.authority,'authority');
  const receipts=arr(input.receipts,'receipts').map((v,i)=>text(v,`receipt_${i}`));

  return freeze({
    schema:SHARED_FLATPLANE_TOPOLOGY_SCHEMA,
    artifact_ref,
    shared_flatplane:freeze({
      plane_ref,
      scale:SHARED_FLATPLANE_SCALE,
      parametric_domain:freeze({domain_ref,axes:freeze(domain_axes)}),
    }),
    primitives:freeze(primitiveRows),
    local_control_patches:freeze(patchRows),
    seam_equivalence:freeze(seamRows),
    continuity_constraints:freeze(continuityRows),
    extrusions:freeze(extrusionRows),
    projection_recipes:freeze(projectionRecipes),
    lineage:freeze({...lineage}),
    authority:freeze({...authority}),
    receipts:freeze(receipts),
    counts:freeze({
      primitives:primitiveRows.length,
      patches:patchRows.length,
      seams:seamRows.length,
      continuity:continuityRows.length,
      extrusions:extrusionRows.length,
      projections:projectionRecipes.length,
    }),
    first_red:null,
    effect_authority:0,
    hard:freeze([
      'FILE_OWNS_SHARED_PLANE',
      'CUBE_DOES_NOT_OWN_ITS_OWN_PLANE',
      'PATCH_DOES_NOT_OWN_ITS_OWN_PLANE',
      'EXTRUSION_DOES_NOT_OWN_ITS_OWN_PLANE',
      'DOCUMENT_ORDER!=SEMANTIC_Z',
      'PROJECTION!=IDENTITY_MUTATION',
      'FILE_RECOGNIZED!=TOPOLOGY_QUALIFIED',
    ]),
  });
}

export const compileSharedFlatplaneTopology=SharedFlatplaneTopology;
