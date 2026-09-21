import crypto from 'node:crypto';

export const PROJECT_PROJECTION_INPUT_SCHEMA='xiio.sdk.project-projection-input/v1';
export const PROJECT_PROJECTION_SCHEMA='xiio.sdk.project-projection/v1';
const STATES=new Set(['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE']);
const EFFECTS=new Set(['NO_EFFECT','READ_ONLY_PROJECTION']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVED_TARGET_KEYS=new Set([
  'canonical_digest','root_uuid','work_uuid','generation','canonical_cells','state_counts',
  'unknown_ids','wait_ids','fail_ids','authority_granted','effect_authority','external_truth_verified'
]);

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
function hash(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function text(v,k,max=512){
  if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>max) throw new TypeError(k+'_INVALID');
  return v;
}
function refs(v,k){
  if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x.trim())) throw new TypeError(k+'_INVALID');
  return [...new Set(v)];
}
function clone(v){return structuredClone(v);}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function counts(cells){
  const out={PASS:0,FAIL:0,WAIT:0,UNKNOWN:0,N_A_WITH_EVIDENCE:0};
  for(const c of cells) out[c.state]++;
  return out;
}
function normalizeCell(raw,index){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new TypeError('cell_'+index+'_INVALID');
  const id=text(raw.id,'cell_'+index+'_id');
  if(!STATES.has(raw.state)) throw new TypeError('cell_'+id+'_STATE_INVALID');
  const evidence_refs=refs(raw.evidence_refs??[],'cell_'+id+'_evidence_refs');
  const wake=raw.wake==null?null:text(raw.wake,'cell_'+id+'_wake',2048);
  if((raw.state==='PASS'||raw.state==='N_A_WITH_EVIDENCE')&&!evidence_refs.length) throw new TypeError('cell_'+id+'_POSITIVE_WITHOUT_EVIDENCE');
  if((raw.state==='WAIT'||raw.state==='UNKNOWN')&&!wake) throw new TypeError('cell_'+id+'_OPEN_WITHOUT_WAKE');
  return {
    id,state:raw.state,evidence_refs,wake,
    semantic_ref:raw.semantic_ref==null?null:text(raw.semantic_ref,'cell_'+id+'_semantic_ref',1024),
    value:raw.value===undefined?null:clone(raw.value),
  };
}
function normalizeAlgorithm(raw,index){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new TypeError('algorithm_'+index+'_INVALID');
  const algorithm_ref=text(raw.algorithm_ref,'algorithm_'+index+'_ref',1024);
  const generation=text(raw.generation,'algorithm_'+index+'_generation');
  if(raw.current!==true) throw new TypeError('algorithm_'+algorithm_ref+'_NOT_CURRENT');
  if(raw.qualified!==true) throw new TypeError('algorithm_'+algorithm_ref+'_NOT_QUALIFIED');
  return {algorithm_ref,generation,current:true,qualified:true};
}
function normalizeTarget(raw,index){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new TypeError('target_'+index+'_INVALID');
  const target_id=text(raw.target_id,'target_'+index+'_id');
  const adapter_ref=text(raw.adapter_ref,'target_'+index+'_adapter_ref',1024);
  const mode=text(raw.mode??'DRAFT','target_'+index+'_mode').toUpperCase();
  if(mode!=='DRAFT') throw new TypeError('TARGET_MODE_MUST_BE_DRAFT');
  const effect_ceiling=text(raw.effect_ceiling??'NO_EFFECT','target_'+index+'_effect').toUpperCase();
  if(!EFFECTS.has(effect_ceiling)) throw new TypeError('TARGET_EFFECT_CEILING_INVALID');
  const target_metadata=raw.target_metadata&&typeof raw.target_metadata==='object'&&!Array.isArray(raw.target_metadata)?clone(raw.target_metadata):{};
  for(const key of Object.keys(target_metadata)){
    if(RESERVED_TARGET_KEYS.has(key)) throw new TypeError('TARGET_METADATA_TRUTH_OVERRIDE:'+key);
  }
  return {
    target_id,adapter_ref,mode,effect_ceiling,
    profile_ref:raw.profile_ref==null?null:text(raw.profile_ref,'target_'+index+'_profile_ref',1024),
    target_metadata,
  };
}
function normalizeScales(raw){
  const input=raw==null?[1,10,100]:raw;
  if(!Array.isArray(input)||!input.length) throw new TypeError('SCALES_REQUIRED');
  const out=[...new Set(input.map(Number))];
  if(out.some(n=>!Number.isSafeInteger(n)||n<1||n>1000000)) throw new TypeError('SCALE_INVALID');
  return out.sort((a,b)=>a-b);
}
function scaleProjection(cells,size){
  const groups=[];
  for(let i=0;i<cells.length;i+=size){
    const members=cells.slice(i,i+size);
    groups.push({
      group_id:`S${size}:G${String(groups.length+1).padStart(4,'0')}`,
      member_ids:members.map(x=>x.id),
      denominator:members.length,
      state_counts:counts(members),
      fail_ids:members.filter(x=>x.state==='FAIL').map(x=>x.id),
      wait_ids:members.filter(x=>x.state==='WAIT').map(x=>x.id),
      unknown_ids:members.filter(x=>x.state==='UNKNOWN').map(x=>x.id),
      evidence_ref_count:new Set(members.flatMap(x=>x.evidence_refs)).size,
    });
  }
  const trace=groups.flatMap(g=>g.member_ids);
  return {
    scale:size,
    group_count:groups.length,
    canonical_cell_denominator:cells.length,
    projected_cell_ref_denominator:trace.length,
    unique_projected_cell_ref_denominator:new Set(trace).size,
    coverage_pct:cells.length?Number(((new Set(trace).size/cells.length)*100).toFixed(3)):100,
    state_counts:counts(cells),
    groups,
  };
}

export function compileProjectProjection(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new TypeError('input_INVALID');
  if(input.schema!==PROJECT_PROJECTION_INPUT_SCHEMA) throw new TypeError('input_schema_INVALID');
  const project_ref=text(input.project_ref,'project_ref',1024);
  const root_uuid=text(input.root_uuid,'root_uuid');
  const work_uuid=text(input.work_uuid,'work_uuid');
  if(!UUID.test(root_uuid)) throw new TypeError('root_uuid_INVALID');
  if(!UUID.test(work_uuid)) throw new TypeError('work_uuid_INVALID');
  const generation=text(input.generation,'generation');
  const sdk_generation=text(input.sdk_generation,'sdk_generation');

  if(!Array.isArray(input.canonical_cells)||!input.canonical_cells.length||input.canonical_cells.length>10000) throw new TypeError('canonical_cells_INVALID');
  const cells=input.canonical_cells.map(normalizeCell).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  if(new Set(cells.map(x=>x.id)).size!==cells.length) throw new TypeError('DUPLICATE_CELL_ID');

  if(!Array.isArray(input.algorithm_stack)||!input.algorithm_stack.length) throw new TypeError('algorithm_stack_REQUIRED');
  const algorithm_stack=input.algorithm_stack.map(normalizeAlgorithm);
  if(new Set(algorithm_stack.map(x=>x.algorithm_ref)).size!==algorithm_stack.length) throw new TypeError('DUPLICATE_ALGORITHM_REF');

  if(!Array.isArray(input.targets)||!input.targets.length||input.targets.length>64) throw new TypeError('targets_INVALID');
  const targets=input.targets.map(normalizeTarget);
  if(new Set(targets.map(x=>x.target_id)).size!==targets.length) throw new TypeError('DUPLICATE_TARGET_ID');

  const scales=normalizeScales(input.scales);
  const canonical_core={
    project_ref,root_uuid,work_uuid,generation,
    canonical_cells:cells,
  };
  const canonical_digest='sha256:'+hash(canonical_core);
  const state_counts=counts(cells);
  const fail_ids=cells.filter(x=>x.state==='FAIL').map(x=>x.id);
  const wait_ids=cells.filter(x=>x.state==='WAIT').map(x=>x.id);
  const unknown_ids=cells.filter(x=>x.state==='UNKNOWN').map(x=>x.id);
  const na_ids=cells.filter(x=>x.state==='N_A_WITH_EVIDENCE').map(x=>x.id);
  const scale_projections=scales.map(size=>scaleProjection(cells,size));

  for(const p of scale_projections){
    if(p.coverage_pct!==100||p.unique_projected_cell_ref_denominator!==cells.length) throw new Error('PROJECTION_ACCOUNTING_NOT_100');
    if(JSON.stringify(p.state_counts)!==JSON.stringify(state_counts)) throw new Error('PROJECTION_STATE_TALLY_DRIFT');
  }

  const target_projections=targets.map(target=>({
    schema:'xiio.sdk.project-target-projection/v1',
    project_ref,
    root_uuid,work_uuid,generation,sdk_generation,
    canonical_digest,
    target_id:target.target_id,
    adapter_ref:target.adapter_ref,
    mode:'DRAFT',
    effect_ceiling:target.effect_ceiling,
    profile_ref:target.profile_ref,
    target_metadata:target.target_metadata,
    canonical_cell_denominator:cells.length,
    state_counts,
    fail_ids,wait_ids,unknown_ids,na_ids,
    scale_projections,
    projection_fidelity_pct:100,
    external_truth_verified:false,
    runtime_verified:false,
    authority_granted:false,
    effect_authority:false,
    deploy_authorized:false,
  }));

  const digestSet=new Set(target_projections.map(x=>x.canonical_digest));
  const allScaleFidelity=target_projections.every(t=>t.scale_projections.every(s=>s.coverage_pct===100));
  const project_is_projection_candidate=digestSet.size===1&&allScaleFidelity;

  return deepFreeze({
    schema:PROJECT_PROJECTION_SCHEMA,
    project_ref,root_uuid,work_uuid,generation,sdk_generation,
    canonical_digest,
    canonical_cell_denominator:cells.length,
    canonical_cells:cells,
    state_counts,
    fail_ids,wait_ids,unknown_ids,na_ids,
    algorithm_stack,
    scales,
    target_projections,
    project_is_projection_candidate,
    projection_fidelity_pct:project_is_projection_candidate?100:0,
    known_state_accounting_pct:project_is_projection_candidate?100:0,
    external_truth_verified:false,
    runtime_verified:false,
    simulation_boundary:{
      simulatable:[
        'projection shape','scale aggregation','adapter selection','draft target composition',
        'state conservation','unknown propagation','effect-ceiling preservation','UUID lineage',
        'renderer/profile compatibility','return-path structure'
      ],
      requires_observation:[
        'provider availability','physical host state','network state','human action',
        'legal/source truth not already evidenced','external side effects','target readback',
        'performance under real load'
      ],
      rule:'SIMULATION MAY PROVE PROJECTION CONSERVATION; IT CANNOT CREATE UNOBSERVED EXTERNAL TRUTH.'
    },
    authority:{
      work:false,provider:false,deploy:false,release:false,legal:false,billing:false
    },
    hard:[
      'PROJECT_PROJECTION!=PROJECT_SOURCE_TRUTH',
      'PROJECTION_FIDELITY_100!=EXTERNAL_TRUTH_100',
      'UNKNOWN_WAIT_FAIL_MUST_SURVIVE_ALL_PROJECTIONS',
      'TARGET_ADAPTER_MAY_CHANGE_CANONICAL_DIGEST_MAY_NOT',
      'SCALE_CHANGE_MAY_COMPRESS_VIEW_NOT_DENOMINATOR_ACCOUNTING',
      'DRAFT_TARGET!=DEPLOY_AUTHORITY',
      'RENDER_READY!=TARGET_READBACK',
      'ALGORITHM_CURRENT+QUALIFIED!=RUNTIME_OBSERVED',
      'PROJECT_IS_PROJECTION_CANDIDATE!=ALL_REALITY_SIMULATABLE'
    ]
  });
}
