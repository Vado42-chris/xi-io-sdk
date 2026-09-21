const STATES=new Set(['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE']);
export const QUAL_QUANT_MATRIX_REQUIRED_CELLS=Object.freeze([
 'POLARITY_SOLAR_GOLDEN','POLARITY_LUNAR_SUBTERRANEAN',
 'PLANE_GOLDEN_QUAL','PLANE_GOLDEN_QUANT','PLANE_SUBTERRANEAN_QUAL','PLANE_SUBTERRANEAN_QUANT',
 'AXIS_HORIZONTAL','AXIS_VERTICAL','AXIS_X_UP','AXIS_X_DOWN','AXIS_TRIANGULATION_X',
 'IDENTITY_ROOT','IDENTITY_GENERATION','PROVENANCE'
]);
const passLike=s=>s==='PASS'||s==='N_A_WITH_EVIDENCE';
const clone=v=>structuredClone(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?clone(v):{};
const list=v=>Array.isArray(v)?[...v]:[];
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};

function cell(id,raw={}){
 const state=String(raw.state||'UNKNOWN').toUpperCase();
 if(!STATES.has(state))throw new TypeError('CELL_STATE_INVALID:'+id);
 const evidence_refs=list(raw.evidence_refs).filter(x=>typeof x==='string'&&x.trim());
 const wake=typeof raw.wake==='string'&&raw.wake.trim()?raw.wake.trim():null;
 const blockers=[];
 if((state==='PASS'||state==='N_A_WITH_EVIDENCE')&&!evidence_refs.length) blockers.push('POSITIVE_WITHOUT_EVIDENCE');
 if((state==='WAIT'||state==='UNKNOWN')&&!wake) blockers.push('OPEN_WITHOUT_WAKE');
 return {id,state,evidence_refs,wake,blockers};
}
function qualDiff(g,s){
 const keys=[...new Set([...Object.keys(g),...Object.keys(s)])].sort();
 return keys.map(key=>{
  const gh=Object.prototype.hasOwnProperty.call(g,key),sh=Object.prototype.hasOwnProperty.call(s,key);
  if(!gh)return {key,state:'MISSING_GOLDEN',golden:null,subterranean:s[key]};
  if(!sh)return {key,state:'MISSING_SUBTERRANEAN',golden:g[key],subterranean:null};
  const same=JSON.stringify(g[key])===JSON.stringify(s[key]);
  return {key,state:same?'SAME':'DIFFERENT',golden:g[key],subterranean:s[key]};
 });
}
function quantDiff(g,s,units){
 const keys=[...new Set([...Object.keys(g),...Object.keys(s)])].sort();
 return keys.map(key=>{
  const gv=g[key],sv=s[key],unit=units[key]||null;
  if(typeof gv!=='number'||typeof sv!=='number') return {key,state:'INCOMPARABLE_WITH_REASON',reason:'NON_NUMERIC_OR_MISSING',unit,golden_value:gv??null,subterranean_value:sv??null};
  return {key,state:'COMPARABLE',unit,golden_value:gv,subterranean_value:sv,delta:gv-sv};
 });
}
export function compileQualQuantTopography(input={}){
 const identity={
  root_uuid:text(input.identity?.root_uuid,'root_uuid'),
  work_ref:text(input.identity?.work_ref,'work_ref'),
  generation:text(input.identity?.generation,'generation')
 };
 const cells=QUAL_QUANT_MATRIX_REQUIRED_CELLS.map(id=>cell(id,input.cells?.[id]));
 const blockers=cells.flatMap(c=>c.blockers.map(b=>c.id+':'+b));
 const open=cells.filter(c=>!passLike(c.state));
 const quorum={
  profile_id:'DERIVATION_FULL_AXIS_QUORUM_V1',
  denominator:QUAL_QUANT_MATRIX_REQUIRED_CELLS.length,
  pass_like:cells.filter(c=>passLike(c.state)).length,
  fail:cells.filter(c=>c.state==='FAIL').length,
  wait:cells.filter(c=>c.state==='WAIT').length,
  unknown:cells.filter(c=>c.state==='UNKNOWN').length,
  n_a_with_evidence:cells.filter(c=>c.state==='N_A_WITH_EVIDENCE').length,
  complete:blockers.length===0&&open.length===0
 };
 const golden=object(input.golden),subterranean=object(input.subterranean),units=object(input.quant_units);
 const derivation=quorum.complete?{
  state:'DERIVATION_CANDIDATE',
  qualitative_diff:qualDiff(object(golden.qualitative_data),object(subterranean.qualitative_data)),
  quantitative_diff:quantDiff(object(golden.quantitative_data),object(subterranean.quantitative_data),units),
  authority_granted:false
 }:{
  state:'BLOCKED_QUORUM',
  qualitative_diff:[],
  quantitative_diff:[],
  authority_granted:false
 };
 return Object.freeze({
  schema:'xiio.sdk.qual-quant-topography/v1',
  identity,
  polarity:Object.freeze({
   solar_golden:Object.freeze({token:'#solar',canonical:'#golden_path'}),
   lunar_subterranean:Object.freeze({token:'#lunar',canonical:'#subterranean'})
  }),
  axes:Object.freeze({
   horizontal:'SAME_ROOT_ACROSS_SURFACES',
   vertical:'SAME_ROOT_ACROSS_LIFECYCLE',
   x_up:'LEAF_TO_PARENT_ROOT__X42_REAP_DIRECTION',
   x_down:'ROOT_TO_CHILD_DETAIL__X42_SOW_DIRECTION',
   triangulation_x:'HORIZONTAL+VERTICAL+POLARITY_IDENTITY_CROSSCHECK'
  }),
  cells:Object.freeze(cells),
  quorum:Object.freeze(quorum),
  derivation:Object.freeze(derivation),
  raw:Object.freeze({golden,subterranean}),
  authority_granted:false,
  provider_effect:false,
  hard:Object.freeze([
   'RAW_QUAL_QUANT_SURVIVES',
   'QUORUM!=AUTHORITY',
   'TRIANGULATION!=MAJORITY_TRUTH',
   'DERIVATION_CANDIDATE!=GOLDEN_TRUTH',
   'SOLAR_ALIAS!=GOLD_QUALIFICATION',
   'LUNAR_ALIAS!=SUBTERRANEAN_RUNTIME',
   'X_UP_REAP_DIRECTION!=RETURN_PROOF',
   'X_DOWN_SOW_DIRECTION!=WORK_ADMISSION',
   'DATAFORGE_NORMALIZED!=BINS_CUSTODIED'
  ])
 });
}

export function qualQuantTopographyCatalog(){
 return Object.freeze({
  schema:'xiio.sdk.qual-quant-topography-catalog/v1',
  required_cells:[...QUAL_QUANT_MATRIX_REQUIRED_CELLS],
  quorum_profile:'DERIVATION_FULL_AXIS_QUORUM_V1',
  denominator:QUAL_QUANT_MATRIX_REQUIRED_CELLS.length,
  axes:['HORIZONTAL','VERTICAL','X_UP','X_DOWN','TRIANGULATION_X'],
  polarities:['SOLAR_GOLDEN','LUNAR_SUBTERRANEAN'],
  planes:['QUAL','QUANT'],
  authority_granted:false,
  provider_effect:false
 });
}
