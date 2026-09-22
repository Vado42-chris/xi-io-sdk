const STATES=new Set(['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE']);
export const PATHS=Object.freeze(['GOLDEN','SUBTERRANEAN']);
export const ILLUMINATIONS=Object.freeze(['SOLAR','LUNAR']);
export const ORIENTATIONS=Object.freeze(['HORIZONTAL','VERTICAL']);
export const MOVEMENTS=Object.freeze(['SOW_OUTWARD','REAP_INWARD']);
export const SPLITS=Object.freeze(['QUAL','QUANT']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const passLike=s=>s==='PASS'||s==='N_A_WITH_EVIDENCE';
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const list=v=>Array.isArray(v)?[...v]:[];
const uniq=v=>[...new Set(v)];

export function quantumTopographyV2Catalog(){
 const addresses=[];
 for(const path of PATHS)for(const illumination of ILLUMINATIONS)for(const orientation of ORIENTATIONS)for(const movement of MOVEMENTS)for(const split of SPLITS){
  addresses.push(Object.freeze({id:[path,illumination,orientation,movement,split].join('.'),path,illumination,orientation,movement,split}));
 }
 return Object.freeze({
  schema:'xiio.sdk.quantum-topography-v2-catalog/v1',
  denominator:32,
  axes:Object.freeze({path:[...PATHS],illumination:[...ILLUMINATIONS],orientation:[...ORIENTATIONS],movement:[...MOVEMENTS],split:[...SPLITS]}),
  addresses:Object.freeze(addresses),
  projection_aliases:Object.freeze({
   namespace:'SDK_V2_X42_CANONICAL',
   X_UP:Object.freeze({operation:'REAP_INWARD',token:'<<'}),
   X_DOWN:Object.freeze({operation:'SOW_OUTWARD',token:'>>'})
  }),
  operators:Object.freeze(['TRIANGULATION_X','CENSUS','QUORUM']),
  authority_granted:false,
  provider_effect:false
 });
}
const CATALOG=quantumTopographyV2Catalog();
const IDS=new Set(CATALOG.addresses.map(a=>a.id));

function normalizeCell(address,raw){
 const state=String(raw?.state||'UNKNOWN').toUpperCase();
 if(!STATES.has(state))throw new TypeError('CELL_STATE_INVALID:'+address.id);
 const evidence_refs=uniq(list(raw?.evidence_refs).filter(x=>typeof x==='string'&&x.trim()));
 const wake=typeof raw?.wake==='string'&&raw.wake.trim()?raw.wake.trim():null;
 const unit=typeof raw?.unit==='string'&&raw.unit.trim()?raw.unit.trim():null;
 const raw_value=raw?.raw_value??null;
 const blockers=[];
 if((state==='PASS'||state==='FAIL'||state==='N_A_WITH_EVIDENCE')&&evidence_refs.length===0) blockers.push('TERMINAL_STATE_WITHOUT_EVIDENCE');
 if((state==='WAIT'||state==='UNKNOWN')&&!wake) blockers.push('OPEN_WITHOUT_WAKE');
 if(state==='PASS'&&address.split==='QUAL'&&raw_value===null) blockers.push('QUAL_PASS_WITHOUT_RAW_VALUE');
 if(state==='PASS'&&address.split==='QUANT'&&(!Number.isFinite(raw_value)||!unit)) blockers.push('QUANT_PASS_REQUIRES_NUMERIC_VALUE_AND_UNIT');
 return Object.freeze({...address,state,evidence_refs,wake,raw_value,unit,blockers,supplied:Boolean(raw)});
}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=='object')return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));

function comparePair(a,b,axis){
 const open=![a,b].every(x=>passLike(x.state)&&x.blockers.length===0);
 if(open)return {axis,state:'BLOCKED',left_ref:a.id,right_ref:b.id,left_state:a.state,right_state:b.state};
 if(a.split==='QUAL')return {axis,state:same(a.raw_value,b.raw_value)?'SAME':'DIFFERENT',left_ref:a.id,right_ref:b.id,left_value:a.raw_value,right_value:b.raw_value,split:'QUAL'};
 if(a.unit!==b.unit)return {axis,state:'INCOMPARABLE_UNIT',left_ref:a.id,right_ref:b.id,left_unit:a.unit,right_unit:b.unit,split:'QUANT'};
 return {axis,state:'COMPARABLE',left_ref:a.id,right_ref:b.id,left_value:a.raw_value,right_value:b.raw_value,unit:a.unit,delta:a.raw_value-b.raw_value,split:'QUANT'};
}
function mirrored(cells,axis){
 const groups=new Map();
 for(const c of cells){
  const key=axis==='PATH'?[c.illumination,c.orientation,c.movement,c.split].join('|')
   :axis==='ILLUMINATION'?[c.path,c.orientation,c.movement,c.split].join('|')
   :axis==='ORIENTATION'?[c.path,c.illumination,c.movement,c.split].join('|')
   :[c.path,c.illumination,c.orientation,c.split].join('|');
  const arr=groups.get(key)||[];arr.push(c);groups.set(key,arr);
 }
 const out=[];
 for(const [key,arr] of groups){
  const ordered=axis==='PATH'?[arr.find(x=>x.path==='GOLDEN'),arr.find(x=>x.path==='SUBTERRANEAN')]
   :axis==='ILLUMINATION'?[arr.find(x=>x.illumination==='SOLAR'),arr.find(x=>x.illumination==='LUNAR')]
   :axis==='ORIENTATION'?[arr.find(x=>x.orientation==='HORIZONTAL'),arr.find(x=>x.orientation==='VERTICAL')]
   :[arr.find(x=>x.movement==='SOW_OUTWARD'),arr.find(x=>x.movement==='REAP_INWARD')];
  if(ordered.some(x=>!x))throw new TypeError('MIRROR_PAIR_INCOMPLETE:'+axis+':'+key);
  out.push({key,...comparePair(ordered[0],ordered[1],axis)});
 }
 return out.sort((a,b)=>a.key.localeCompare(b.key));
}
function triangulation(raw={}){
 const rays=list(raw.rays);
 const principals=uniq(rays.map(r=>r?.principal_ref).filter(x=>typeof x==='string'&&x.trim()));
 const invalid_refs=[];let evidence_complete=true;
 for(const ray of rays){
  const ev=list(ray?.evidence_refs).filter(x=>typeof x==='string'&&x.trim());
  if(ev.length===0)evidence_complete=false;
  for(const id of list(ray?.address_refs))if(!IDS.has(id))invalid_refs.push(id);
 }
 const minimum=Number.isSafeInteger(raw.minimum_distinct_principals)&&raw.minimum_distinct_principals>=3?raw.minimum_distinct_principals:3;
 return Object.freeze({
  ray_count:rays.length,distinct_principal_count:principals.length,minimum_distinct_principals:minimum,
  evidence_complete,invalid_address_refs:uniq(invalid_refs),
  pass:rays.length>=minimum&&principals.length>=minimum&&evidence_complete&&invalid_refs.length===0,
  rays,
  hard:Object.freeze(['TRIANGULATION!=MAJORITY_TRUTH','DISTINCT_RAYS_REQUIRED','RAY_IDENTITY_MUST_MATCH_CURRENT_MATRIX'])
 });
}
function quorum(raw,cells){
 const required_refs=list(raw?.required_address_refs).length?uniq(raw.required_address_refs):CATALOG.addresses.map(a=>a.id);
 for(const id of required_refs)if(!IDS.has(id))throw new TypeError('QUORUM_ADDRESS_INVALID:'+id);
 const threshold=Number.isSafeInteger(raw?.threshold)&&raw.threshold>=0?raw.threshold:required_refs.length;
 if(threshold>required_refs.length)throw new TypeError('QUORUM_THRESHOLD_GT_DENOMINATOR');
 const byId=new Map(cells.map(c=>[c.id,c]));
 const qualified_refs=required_refs.filter(id=>{const c=byId.get(id);return c&&passLike(c.state)&&c.blockers.length===0;});
 const profile_id=typeof raw?.profile_id==='string'&&raw.profile_id.trim()?raw.profile_id.trim():'FULL_32_DERIVATION_QUORUM_V2';
 return Object.freeze({
  profile_id,denominator:required_refs.length,threshold,qualified_count:qualified_refs.length,
  qualified_refs:Object.freeze(qualified_refs),pass:qualified_refs.length>=threshold,
  full_derivation_profile:profile_id==='FULL_32_DERIVATION_QUORUM_V2'&&required_refs.length===32&&threshold===32,
  hard:Object.freeze(['QUORUM!=TRUTH','QUORUM_THRESHOLD_DECLARED_NOT_INFERRED','TEAM_SIZE!=QUORUM'])
 });
}

export function compileQuantumTopographyV2(input={}){
 const identity=Object.freeze({root_uuid:text(input.identity?.root_uuid,'root_uuid'),work_ref:text(input.identity?.work_ref,'work_ref'),generation:text(input.identity?.generation,'generation')});
 if(!UUID.test(identity.root_uuid))throw new TypeError('root_uuid_INVALID');
 const rawCells=input.cells&&typeof input.cells==='object'&&!Array.isArray(input.cells)?input.cells:{};
 const cells=CATALOG.addresses.map(a=>normalizeCell(a,rawCells[a.id]));
 const blockers=cells.flatMap(c=>c.blockers.map(b=>c.id+':'+b));
 const census=Object.freeze({
  profile_id:'FULL_32_ADDRESS_CENSUS_V2',denominator:32,supplied_count:cells.filter(c=>c.supplied).length,
  pass_like:cells.filter(c=>passLike(c.state)&&c.blockers.length===0).length,
  fail:cells.filter(c=>c.state==='FAIL').length,wait:cells.filter(c=>c.state==='WAIT').length,
  unknown:cells.filter(c=>c.state==='UNKNOWN').length,n_a_with_evidence:cells.filter(c=>c.state==='N_A_WITH_EVIDENCE').length,
  complete:cells.every(c=>c.supplied)
 });
 const q=quorum(input.operators?.quorum||{},cells);
 const tri=triangulation(input.operators?.triangulation_x||{});
 const mirrors=Object.freeze({
  path:Object.freeze(mirrored(cells,'PATH')),
  illumination:Object.freeze(mirrored(cells,'ILLUMINATION')),
  orientation:Object.freeze(mirrored(cells,'ORIENTATION')),
  movement:Object.freeze(mirrored(cells,'MOVEMENT'))
 });
 const research_complete=input.research_complete===true;
 const return_cycle_complete=input.return_cycle_complete===true;
 const silent_remainder=Number.isSafeInteger(input.silent_remainder)&&input.silent_remainder>=0?input.silent_remainder:null;
 const all32Pass=cells.every(c=>passLike(c.state)&&c.blockers.length===0);
 const derivation_ready=all32Pass&&q.pass&&q.full_derivation_profile;
 let grade='BRONZE';
 if(research_complete&&census.complete)grade='SILVER';
 if(research_complete&&census.complete&&derivation_ready&&tri.pass&&return_cycle_complete&&silent_remainder===0)grade='GOLD';
 const grade_blockers=[];
 if(!research_complete)grade_blockers.push('RESEARCH_INCOMPLETE');
 if(!census.complete)grade_blockers.push('CENSUS_INCOMPLETE');
 if(blockers.length)grade_blockers.push(...blockers);
 if(!q.pass)grade_blockers.push('QUORUM_NOT_PASSED');
 if(!q.full_derivation_profile)grade_blockers.push('FULL_32_DERIVATION_QUORUM_NOT_BOUND');
 if(!tri.pass)grade_blockers.push('TRIANGULATION_NOT_PASSED');
 if(!return_cycle_complete)grade_blockers.push('RETURN_CYCLE_OPEN');
 if(silent_remainder!==0)grade_blockers.push('SILENT_REMAINDER_NONZERO_OR_UNBOUND');
 return Object.freeze({
  schema:'xiio.sdk.quantum-topography-v2/v1',identity,
  address_formula:'PATH(2)*ILLUMINATION(2)*ORIENTATION(2)*MOVEMENT(2)*SPLIT(2)=32',
  catalog:CATALOG,cells:Object.freeze(cells),census,quorum:q,triangulation_x:tri,mirrors,
  derivation:Object.freeze({
   state:derivation_ready?'DERIVATION_READY':'BLOCKED_QUORUM',
   path_pair_count:mirrors.path.length,illumination_pair_count:mirrors.illumination.length,
   orientation_pair_count:mirrors.orientation.length,movement_pair_count:mirrors.movement.length,
   authority_granted:false
  }),
  research_complete,return_cycle_complete,silent_remainder,grade,grade_blockers:Object.freeze(uniq(grade_blockers)),
  authority_granted:false,provider_effect:false,
  hard:Object.freeze([
   'PATH!=ILLUMINATION','GOLDEN!=SOLAR','SUBTERRANEAN!=LUNAR','QUAL!=QUANT','HORIZONTAL!=VERTICAL',
   'SOW_OUTWARD!=REAP_INWARD','X_UP=REAP_INWARD_<<','X_DOWN=SOW_OUTWARD_>>','X_LABEL_REQUIRES_NAMESPACE',
   'TRIANGULATION_X!=ADDRESS_AXIS','CENSUS!=QUORUM','QUORUM!=TRUTH','32_ADDRESSES!=32_TASKS',
   'DERIVATION_READY!=EFFECT_AUTHORITY','GOLD!=EFFECT_AUTHORITY'
  ])
 });
}
