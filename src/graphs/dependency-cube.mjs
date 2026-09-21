import { compileImpactFormation } from '../ibal/impact-formation.mjs';

export const DEPENDENCY_CUBE_SCHEMA='xiio.sdk.dependency-cube/v1';
export const DEPENDENCY_FACES=Object.freeze(['INTERNAL','EXTERNAL','GLASS']);
export const DEPENDENCY_STATES=Object.freeze(['PASS','FAIL','UNKNOWN','TRUE_WAIT','N_A_WITH_EVIDENCE']);
export const DEPENDENCY_CURRENTNESS=Object.freeze(['CURRENT','STALE','UNKNOWN']);

const REF=/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,511}$/;
function text(v,k,max=512){if(typeof v!=='string'||!v.trim()||v.length>max)throw new TypeError(k+'_INVALID');return v.trim();}
function ref(v,k){const s=text(v,k);if(!REF.test(s))throw new TypeError(k+'_REF_INVALID');return s;}
function arr(v,k){if(!Array.isArray(v))throw new TypeError(k+'_INVALID');return v;}
function state(v,k){if(!DEPENDENCY_STATES.includes(v))throw new TypeError(k+'_INVALID');return v;}
function currentness(v,k){if(!DEPENDENCY_CURRENTNESS.includes(v))throw new TypeError(k+'_INVALID');return v;}
function bool(v,k){if(typeof v!=='boolean')throw new TypeError(k+'_INVALID');return v;}
function integer(v,k,min=0,max=4){if(!Number.isInteger(v)||v<min||v>max)throw new TypeError(k+'_INVALID');return v;}

function normalizeEdge(raw,face){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('edge_INVALID');
  const s=state(raw.state,'edge.state');
  const c=currentness(raw.currentness||'UNKNOWN','edge.currentness');
  const evidence_refs=[...new Set(arr(raw.evidence_refs??[],'edge.evidence_refs').map((x)=>ref(x,'evidence_ref')))];
  const wake=raw.wake==null?null:text(raw.wake,'edge.wake',2048);
  if((s==='PASS'||s==='N_A_WITH_EVIDENCE')&&!evidence_refs.length)throw new TypeError('POSITIVE_EDGE_EVIDENCE_REQUIRED');
  if((s==='TRUE_WAIT'||s==='UNKNOWN')&&!wake)throw new TypeError('OPEN_EDGE_WAKE_REQUIRED');
  const affected_project_refs=[...new Set(arr(raw.affected_project_refs??[],'edge.affected_project_refs').map((x)=>ref(x,'affected_project_ref')))].sort();
  return Object.freeze({
    face,
    edge_id:ref(raw.edge_id,'edge.edge_id'),
    dependency_key:ref(raw.dependency_key,'edge.dependency_key'),
    target_ref:ref(raw.target_ref,'edge.target_ref'),
    owner_ref:ref(raw.owner_ref,'edge.owner_ref'),
    relationship_ref:ref(raw.relationship_ref||`dependency:${raw.dependency_key}`,'edge.relationship_ref'),
    state:s,
    currentness:c,
    material:raw.material!==false,
    evidence_refs,
    wake,
    affected_project_refs,
    provider_effect:false,
    authority_granted:false
  });
}

function faceSummary(face,edges){
  const rows=edges.filter(e=>e.face===face);
  const counts=Object.fromEntries(DEPENDENCY_STATES.map(s=>[s,rows.filter(r=>r.state===s).length]));
  const first_red=rows.find(r=>r.state==='FAIL')||rows.find(r=>r.state==='UNKNOWN')||rows.find(r=>r.state==='TRUE_WAIT')||null;
  const state=counts.FAIL?'FAIL':counts.UNKNOWN?'UNKNOWN':counts.TRUE_WAIT?'TRUE_WAIT':'PASS';
  return Object.freeze({face,denominator:rows.length,counts,state,first_red});
}

function projectImpactNodes(root,edges,projects){
  const byProject=new Map(projects.map(p=>[p.project_ref,p]));
  const nodes=[];
  for(const project of projects){
    const relevant=edges.filter(e=>e.affected_project_refs.includes(project.project_ref));
    if(!relevant.length && project.applicability==='NO_EFFECT') {
      nodes.push({
        ref:project.project_ref,direction:'DOWNSTREAM',state:'NO_EFFECT',currentness:'CURRENT',
        priority:project.priority,risk:0,user_impact:0,time_pressure:0,fanout:0,cognitive_load:0,
        human_facing:project.human_facing,independent_review_required:false,ux_review_required:false,
        parallel_safe:true,runnable:false,dependencies:[]
      });
      continue;
    }
    const anyFail=relevant.some(e=>e.state==='FAIL');
    const anyOpen=relevant.some(e=>['UNKNOWN','TRUE_WAIT'].includes(e.state));
    const allCurrent=relevant.length>0&&relevant.every(e=>e.currentness==='CURRENT');
    const affected=relevant.length>0&&relevant.some(e=>e.material&&e.state!=='N_A_WITH_EVIDENCE');
    nodes.push({
      ref:project.project_ref,
      direction:'DOWNSTREAM',
      state:anyFail||affected?'AFFECTED':anyOpen?'UNKNOWN':'NO_EFFECT',
      currentness:allCurrent?'CURRENT':relevant.some(e=>e.currentness==='STALE')?'STALE':'UNKNOWN',
      priority:project.priority,
      risk:integer(project.risk??1,'project.risk'),
      user_impact:integer(project.user_impact??(project.human_facing?2:1),'project.user_impact'),
      time_pressure:integer(project.time_pressure??1,'project.time_pressure'),
      fanout:integer(Math.min(4,relevant.length),'project.fanout'),
      cognitive_load:integer(project.cognitive_load??1,'project.cognitive_load'),
      human_facing:bool(project.human_facing,'project.human_facing'),
      independent_review_required:project.independent_review_required===true,
      ux_review_required:project.ux_review_required!==false,
      parallel_safe:project.parallel_safe!==false,
      runnable:anyFail?true:anyOpen?null:affected?true:false,
      dependencies:relevant.map(e=>e.target_ref)
    });
  }
  return compileImpactFormation({
    schema:'xiio.sdk.impact-formation/v1',
    root:{
      root_ref:root.root_ref,
      generation:root.generation,
      golden_priority_ref:root.golden_priority_ref,
      formation_profile_ref:root.formation_profile_ref
    },
    nodes,
    capacity:root.capacity||{}
  });
}

export function dependencyEdgesFromGlassBox(envelope,{affected_project_refs=[],owner_ref='API_GLASS_BOX'}={}){
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new TypeError('glass_envelope_INVALID');
  if(envelope.schema!=='xiio.api-glass-box.response-envelope/v1')throw new TypeError('glass_envelope_SCHEMA_INVALID');
  const gates=envelope.data?.gates;
  if(!gates||typeof gates!=='object'||Array.isArray(gates))throw new TypeError('glass_gates_INVALID');
  const evidence=[...(envelope.evidence_refs||[]),...(envelope.receipt_refs||[])].filter(Boolean);
  const currentnessState=envelope.semantic_projection?.currentness_credit>0||String(envelope.verification_state||'').includes('VERIFIED')
    ? 'CURRENT':'UNKNOWN';
  return Object.entries(gates).map(([gate,value])=>{
    const raw=String(value||'').toUpperCase();
    const gateState=raw==='PASS'?'PASS':raw==='FAIL'?'FAIL':'UNKNOWN';
    return normalizeEdge({
      edge_id:`glass:${gate}`,
      dependency_key:`glass.${gate}`,
      target_ref:`glass:${gate}`,
      owner_ref,
      relationship_ref:`glass-gate:${gate}`,
      state:gateState,
      currentness:currentnessState,
      material:gate!=='live_promotion_allowed',
      evidence_refs:evidence.length?evidence:[`glass:${envelope.request_id||'unknown'}`],
      wake:gateState==='UNKNOWN'?'REHYDRATE_GLASS_GATE:'+gate:null,
      affected_project_refs
    },'GLASS');
  });
}

export function compileDependencyCube(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('input_INVALID');
  if(input.schema!==DEPENDENCY_CUBE_SCHEMA)throw new TypeError('schema_INVALID');
  const rootRaw=input.root||{};
  const root={
    root_ref:ref(rootRaw.root_ref,'root.root_ref'),
    root_uuid:text(rootRaw.root_uuid,'root.root_uuid'),
    work_uuid:text(rootRaw.work_uuid,'root.work_uuid'),
    generation:ref(rootRaw.generation,'root.generation'),
    studio_root_ref:ref(rootRaw.studio_root_ref,'root.studio_root_ref'),
    golden_priority_ref:ref(rootRaw.golden_priority_ref,'root.golden_priority_ref'),
    formation_profile_ref:ref(rootRaw.formation_profile_ref,'root.formation_profile_ref'),
    capacity:rootRaw.capacity||{}
  };
  const projects=arr(input.studio_projects??[],'studio_projects').map((p,i)=>Object.freeze({
    project_ref:ref(p.project_ref,'project_ref'),
    applicability:p.applicability||'AFFECTED',
    priority:p.priority||'P1',
    risk:integer(p.risk??1,`project[${i}].risk`),
    user_impact:integer(p.user_impact??1,`project[${i}].user_impact`),
    time_pressure:integer(p.time_pressure??1,`project[${i}].time_pressure`),
    cognitive_load:integer(p.cognitive_load??1,`project[${i}].cognitive_load`),
    human_facing:p.human_facing!==false,
    independent_review_required:p.independent_review_required===true,
    ux_review_required:p.ux_review_required!==false,
    parallel_safe:p.parallel_safe!==false
  }));
  const seenProjects=new Set();for(const p of projects){if(seenProjects.has(p.project_ref))throw new TypeError('DUPLICATE_PROJECT');seenProjects.add(p.project_ref);}
  const edges=[
    ...arr(input.internal_edges??[],'internal_edges').map(e=>normalizeEdge(e,'INTERNAL')),
    ...arr(input.external_edges??[],'external_edges').map(e=>normalizeEdge(e,'EXTERNAL')),
    ...arr(input.glass_edges??[],'glass_edges').map(e=>normalizeEdge(e,'GLASS'))
  ];
  const seen=new Set();for(const e of edges){if(seen.has(e.edge_id))throw new TypeError('DUPLICATE_EDGE');seen.add(e.edge_id);}
  const faces=Object.freeze(Object.fromEntries(DEPENDENCY_FACES.map(face=>[face,faceSummary(face,edges)])));
  const byKey={};
  for(const edge of edges){
    byKey[edge.dependency_key]??=[];
    byKey[edge.dependency_key].push(edge);
  }
  const triangulation=Object.entries(byKey).sort(([a],[b])=>a.localeCompare(b)).map(([dependency_key,rows])=>Object.freeze({
    dependency_key,
    faces:[...new Set(rows.map(r=>r.face))].sort(),
    states:[...new Set(rows.map(r=>r.state))].sort(),
    currentness:[...new Set(rows.map(r=>r.currentness))].sort(),
    contradictory_state:new Set(rows.map(r=>r.state)).size>1,
    evidence_refs:[...new Set(rows.flatMap(r=>r.evidence_refs))].sort(),
    affected_project_refs:[...new Set(rows.flatMap(r=>r.affected_project_refs))].sort()
  }));
  const impact=projectImpactNodes(root,edges,projects);
  const studio_projections=projects.map(project=>{
    const relevant=edges.filter(e=>e.affected_project_refs.includes(project.project_ref));
    const plan=impact.plans.find(p=>p.ref===project.project_ref);
    return Object.freeze({
      project_ref:project.project_ref,
      applicability:project.applicability,
      dependency_edge_ids:relevant.map(e=>e.edge_id).sort(),
      dependency_faces:[...new Set(relevant.map(e=>e.face))].sort(),
      impact_state:plan?.state||'NO_EFFECT',
      operation:plan?.operation||'NO_EFFECT',
      currentness:plan?.currentness||'UNKNOWN',
      blockers:plan?.blockers||[],
      return_target:root.studio_root_ref,
      effect_authority:0
    });
  });
  const first_red=faces.INTERNAL.first_red||faces.EXTERNAL.first_red||faces.GLASS.first_red||null;
  return Object.freeze(JSON.parse(JSON.stringify({
    schema:'xiio.sdk.dependency-cube-projection/v1',
    root,
    denominator:{edges:edges.length,projects:projects.length,triangulation_keys:triangulation.length},
    faces,
    edges,
    triangulation,
    ibal_impact_projection:impact,
    studio_projections,
    first_red,
    box_closed:DEPENDENCY_FACES.every(f=>faces[f].state==='PASS')&&triangulation.every(t=>!t.contradictory_state),
    effect_authority:0,
    provider_effect:false,
    hard:[
      'INTERNAL!=EXTERNAL!=GLASS',
      'SOURCE_DEPENDENCY!=RUNTIME_DEPENDENCY',
      'EXTERNAL_AVAILABLE!=ADMITTED',
      'GLASS_PASS_WITH_CURRENTNESS_0!=CURRENT',
      'BLASTWAVE_PROJECTION!=MUTATION_AUTHORITY',
      'IBAL_PROJECTION!=PRODUCT_TRUTH',
      'STUDIO_PROJECTION!=CHILD_PRODUCT_AUTHORITY',
      'ONE_FACE_PASS!=BOX_CLOSED'
    ]
  })));
}
