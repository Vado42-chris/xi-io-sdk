export const TOPOGRAPHY_COORDINATE_SCHEMA='xiio.sdk.topography-coordinate/v1';
export const TOPOGRAPHY_ADDRESS_SPACE_SCHEMA='xiio.sdk.topography-address-space/v1';

export const TOPOGRAPHY_AXES=Object.freeze({
  path:Object.freeze(['GOLDEN','SUBTERRANEAN']),
  illumination:Object.freeze(['SOLAR','LUNAR']),
  orientation:Object.freeze(['HORIZONTAL','VERTICAL']),
  movement_operation:Object.freeze(['SOW_OUTWARD','REAP_INWARD']),
  split:Object.freeze(['QUAL','QUANT']),
  custody_state:Object.freeze(['UNBOUND','NORMALIZED','CUSTODIED','WARD_ADMITTED','RETURNED','REAPED']),
});

export const TOPOGRAPHY_PROJECTION_MAPS=Object.freeze({
  SEARCH_OWNER_20260921:Object.freeze({X_UP:'SOW_OUTWARD',X_DOWN:'REAP_INWARD'}),
  GOLDEN_SUBTERRANEAN_20260921:Object.freeze({X_UP:'REAP_INWARD',X_DOWN:'SOW_OUTWARD'}),
  X42_TOKENS:Object.freeze({'>>':'SOW_OUTWARD','<<':'REAP_INWARD'}),
});

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const txt=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const list=(v,k,{nonEmpty=false}={})=>{
  if(!Array.isArray(v)||(nonEmpty&&v.length===0))throw new TypeError(k+'_ARRAY_REQUIRED');
  const out=[...new Set(v.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))];
  if(nonEmpty&&!out.length)throw new TypeError(k+'_NONEMPTY');
  return out;
};
const one=(v,set,k)=>{const x=txt(v,k);if(!set.includes(x))throw new TypeError(k+'_INVALID');return x;};

export function resolveTopographyProjection({
  movement_operation=null,
  projection_namespace=null,
  projection_label=null,
  projection_maps=TOPOGRAPHY_PROJECTION_MAPS,
}={}){
  const op=movement_operation==null?null:one(movement_operation,TOPOGRAPHY_AXES.movement_operation,'movement_operation');
  if(projection_label==null){
    if(op==null)throw new TypeError('MOVEMENT_OPERATION_OR_PROJECTION_REQUIRED');
    return Object.freeze({movement_operation:op,projection_namespace:null,projection_label:null});
  }
  const ns=txt(projection_namespace,'projection_namespace');
  const label=txt(projection_label,'projection_label');
  const mapped=projection_maps?.[ns]?.[label];
  if(!mapped)throw new TypeError('PROJECTION_MAPPING_UNKNOWN');
  const canonical=one(mapped,TOPOGRAPHY_AXES.movement_operation,'mapped_movement_operation');
  if(op!=null&&op!==canonical)throw new TypeError('PROJECTION_MAPPING_MISMATCH');
  return Object.freeze({movement_operation:canonical,projection_namespace:ns,projection_label:label});
}

export function compileTopographyCoordinate(input={}){
  const root_uuid=txt(input.root_uuid,'root_uuid');
  const work_uuid=txt(input.work_uuid,'work_uuid');
  const coordinate_uuid=txt(input.coordinate_uuid,'coordinate_uuid');
  for(const [k,v] of Object.entries({root_uuid,work_uuid,coordinate_uuid}))if(!UUID.test(v))throw new TypeError(k+'_INVALID');
  const projection=resolveTopographyProjection(input);
  const split=one(input.split,TOPOGRAPHY_AXES.split,'split');
  const evidence_refs=list(input.evidence_refs,'evidence_refs',{nonEmpty:true});
  const out={
    schema:TOPOGRAPHY_COORDINATE_SCHEMA,
    root_uuid,work_uuid,coordinate_uuid,
    generation_ref:txt(input.generation_ref,'generation_ref'),
    time_index:input.time_index??null,
    phase_ref:input.phase_ref??null,
    path:one(input.path,TOPOGRAPHY_AXES.path,'path'),
    illumination:one(input.illumination,TOPOGRAPHY_AXES.illumination,'illumination'),
    orientation:one(input.orientation,TOPOGRAPHY_AXES.orientation,'orientation'),
    movement_operation:projection.movement_operation,
    projection_namespace:projection.projection_namespace,
    projection_label:projection.projection_label,
    split,
    state:txt(input.state??'UNKNOWN','state'),
    qual_raw:input.qual_raw??null,
    quant_raw:input.quant_raw??null,
    quant_unit:input.quant_unit??null,
    quant_denominator:input.quant_denominator??null,
    triangulation_state:input.triangulation_state??'UNRESOLVED',
    census_ref:input.census_ref??null,
    quorum_ref:input.quorum_ref??null,
    evidence_refs:Object.freeze(evidence_refs),
    currentness_state:txt(input.currentness_state??'UNKNOWN','currentness_state'),
    custody_state:one(input.custody_state??'UNBOUND',TOPOGRAPHY_AXES.custody_state,'custody_state'),
    authority_granted:false,
    provider_effect:false,
  };
  if(split==='QUAL'&&out.qual_raw==null)throw new TypeError('QUAL_RAW_REQUIRED');
  if(split==='QUANT'){
    if(out.quant_raw==null)throw new TypeError('QUANT_RAW_REQUIRED');
    if(typeof out.quant_unit!=='string'||!out.quant_unit.trim())throw new TypeError('QUANT_UNIT_REQUIRED');
    if(!Number.isSafeInteger(out.quant_denominator)||out.quant_denominator<1)throw new TypeError('QUANT_DENOMINATOR_REQUIRED');
  }
  return Object.freeze(out);
}

export function topographyCanonicalKey(c){
  if(c?.schema!==TOPOGRAPHY_COORDINATE_SCHEMA)throw new TypeError('TOPOGRAPHY_COORDINATE_REQUIRED');
  return [
    c.root_uuid,c.work_uuid,c.generation_ref,String(c.time_index??''),String(c.phase_ref??''),
    c.path,c.illumination,c.orientation,c.movement_operation,c.split
  ].join('|');
}

export function rotateTopographyProjection(c,{projection_namespace,projection_label}={}){
  if(c?.schema!==TOPOGRAPHY_COORDINATE_SCHEMA)throw new TypeError('TOPOGRAPHY_COORDINATE_REQUIRED');
  const p=resolveTopographyProjection({
    movement_operation:c.movement_operation,
    projection_namespace,projection_label
  });
  return Object.freeze({...c,projection_namespace:p.projection_namespace,projection_label:p.projection_label});
}

export function compileTopographyAddressSpace(input={}){
  const paths=input.paths??TOPOGRAPHY_AXES.path;
  const illuminations=input.illuminations??TOPOGRAPHY_AXES.illumination;
  const orientations=input.orientations??TOPOGRAPHY_AXES.orientation;
  const operations=input.movement_operations??TOPOGRAPHY_AXES.movement_operation;
  const splits=input.splits??TOPOGRAPHY_AXES.split;
  for(const v of paths)one(v,TOPOGRAPHY_AXES.path,'path');
  for(const v of illuminations)one(v,TOPOGRAPHY_AXES.illumination,'illumination');
  for(const v of orientations)one(v,TOPOGRAPHY_AXES.orientation,'orientation');
  for(const v of operations)one(v,TOPOGRAPHY_AXES.movement_operation,'movement_operation');
  for(const v of splits)one(v,TOPOGRAPHY_AXES.split,'split');
  const addresses=[];
  for(const path of paths)for(const illumination of illuminations)for(const orientation of orientations)for(const movement_operation of operations)for(const split of splits){
    addresses.push(Object.freeze({path,illumination,orientation,movement_operation,split}));
  }
  return Object.freeze({
    schema:TOPOGRAPHY_ADDRESS_SPACE_SCHEMA,
    denominator:addresses.length,
    addresses:Object.freeze(addresses),
    factors:Object.freeze({
      path:paths.length,illumination:illuminations.length,orientation:orientations.length,
      movement_operation:operations.length,split:splits.length
    }),
    authority_granted:false,
    provider_effect:false,
    hard:Object.freeze([
      'PATH!=ILLUMINATION','GOLDEN!=SOLAR','SUBTERRANEAN!=LUNAR',
      'SOW_OUTWARD!=REAP_INWARD','PROJECTION_LABEL!=CANONICAL_OPERATION',
      'QUAL!=QUANT','ADDRESS_COUNT!=TASK_COUNT'
    ])
  });
}
