export const FLATPACK_STATE_SCHEMA='xiio.sdk.flatpack-state/v1';
export const FLATPLANE_CUBE_SCHEMA='xiio.sdk.flatplane-cube/v1';
export const FLATPACK_PATCH_SCHEMA='xiio.sdk.flatpack-patch/v1';
export const LOGIC_GATE_DETONATION_SCHEMA='xiio.sdk.logic-gate-detonation/v1';
export const BLASTWAVE_IMPACT_SCHEMA='xiio.sdk.blastwave-impact/v1';
export const AFTERCARE_CARD_SCHEMA='xiio.sdk.aftercare-card/v1';
export const REAP_DEBT_METER_SCHEMA='xiio.sdk.reap-debt-meter/v1';
export const OWNER_COG_LEDGER_SCHEMA='xiio.sdk.owner-cog-ledger/v1';
export const PROJECTION_REBASE_GATE_SCHEMA='xiio.sdk.projection-rebase-gate/v1';
export const CUBE_COORDINATE_SCHEMA='xiio.sdk.cube-coordinate/v1';
export const SPIN_SET_SCHEMA='xiio.sdk.spin-set/v1';

export const WORK_STATES=Object.freeze(['SOURCE','BUILD','LOCAL_RUNTIME','HOSTED_RUNTIME','DOMAIN','OUTSIDE_ORIGIN','HUMAN_USABLE']);
export const SCALE_STATES=Object.freeze(['10S','100S','00S','MICRO','MESO','MACRO','MEGA','META']);
export const SPINS=Object.freeze(['OWNER','FRESH_WORKER','HOSTILE','RUNTIME','BINS','OUTSIDE_ORIGIN','HUMAN_USABLE']);
export const GATE_STATES=Object.freeze(['PASS','FAIL','UNKNOWN','TRUE_WAIT']);

function text(v,k,max=512){if(typeof v!=='string'||!v.trim()||v.length>max)throw new TypeError(k+'_INVALID');return v.trim();}
function optional(v,max=512){return typeof v==='string'&&v.trim()&&v.length<=max?v.trim():null;}
function integer(v,k,min=0,max=1000000){if(!Number.isInteger(v)||v<min||v>max)throw new TypeError(k+'_INVALID');return v;}
function enumv(v,set,k){if(!set.includes(v))throw new TypeError(k+'_INVALID');return v;}
function freeze(v){return Object.freeze(v);}
function arr(v,k){if(!Array.isArray(v))throw new TypeError(k+'_INVALID');return v;}
function gateState(v){return enumv(v,GATE_STATES,'gate_state');}

export function CubeCoordinate(input={}){
  const out={
    schema:CUBE_COORDINATE_SCHEMA,
    target_ref:text(input.target_ref,'target_ref'),
    axis_x_work_state:enumv(input.axis_x_work_state,WORK_STATES,'axis_x_work_state'),
    axis_y_role:text(input.axis_y_role,'axis_y_role'),
    axis_z_scale:enumv(String(input.axis_z_scale||'').toUpperCase(),SCALE_STATES,'axis_z_scale'),
    spin:enumv(input.spin,SPINS,'spin'),
    cell_ref:optional(input.cell_ref),
  };
  return freeze(out);
}
export const compileCubeCoordinate=CubeCoordinate;

export function SpinSet(input={}){
  const spins=[...new Set(arr(input.spins??[], 'spins').map(v=>enumv(v,SPINS,'spin')))];
  if(!spins.length)throw new TypeError('spins_required');
  return freeze({schema:SPIN_SET_SCHEMA,spins,denominator:spins.length,complete:spins.length===SPINS.length});
}
export const compileSpinSet=SpinSet;

export function LogicGateDetonation(input={}){
  const gates=arr(input.gates??[],'gates').map((g,i)=>{
    if(!g||typeof g!=='object'||Array.isArray(g))throw new TypeError('gate_'+i+'_INVALID');
    const state=gateState(g.state);
    return freeze({
      gate_id:text(g.gate_id,'gate_id'),
      state,
      evidence_ref:optional(g.evidence_ref,1024),
      next:optional(g.next,1024),
      wake:optional(g.wake,1024),
      owner_ref:optional(g.owner_ref,512),
      return_target:optional(g.return_target,1024),
    });
  });
  if(!gates.length)throw new TypeError('gates_required');
  const count=(s)=>gates.filter(g=>g.state===s).length;
  const counts={pass:count('PASS'),fail:count('FAIL'),unknown:count('UNKNOWN'),true_wait:count('TRUE_WAIT')};
  const firstRed=gates.find(g=>g.state==='FAIL')||gates.find(g=>g.state==='UNKNOWN')||gates.find(g=>g.state==='TRUE_WAIT')||null;
  const state=counts.fail?'FAIL':counts.unknown?'UNKNOWN':counts.true_wait?'TRUE_WAIT':'PASS';
  return freeze({
    schema:LOGIC_GATE_DETONATION_SCHEMA,
    target_ref:text(input.target_ref,'target_ref'),
    denominator:gates.length,
    counts,
    state,
    closure_100:state==='PASS'&&counts.pass===gates.length,
    first_red:firstRed,
    runnable_reds:gates.filter(g=>g.state==='FAIL'&&g.next),
    true_waits:gates.filter(g=>g.state==='TRUE_WAIT'),
    unknowns:gates.filter(g=>g.state==='UNKNOWN'),
    gates,
    effect_ceiling:input.effect_ceiling??0,
    hard:['PASS!=LIVE','REPORT!=RETURN','RESULT!=RETURN!=APPLY_RETURN','UNKNOWN_BLOCKS_CREDIT','TRUE_WAIT_DOES_NOT_BLOCK_RUNNABLE_SIBLINGS'],
  });
}
export const detonateLogicGates=LogicGateDetonation;

export function FlatplaneCube(input={}){
  const coordinates=arr(input.coordinates??[],'coordinates').map(CubeCoordinate);
  if(!coordinates.length)throw new TypeError('coordinates_required');
  const spins=SpinSet({spins:input.spins??[]});
  const detonation=LogicGateDetonation({target_ref:input.cube_id,gates:input.gates??[],effect_ceiling:input.effect_ceiling??0});
  return freeze({
    schema:FLATPLANE_CUBE_SCHEMA,
    cube_id:text(input.cube_id,'cube_id'),
    owner_goal:text(input.owner_goal,'owner_goal',1024),
    big_ticket_priority:text(input.big_ticket_priority,'big_ticket_priority',1024),
    coordinates,
    spins,
    detonation,
    first_red:detonation.first_red,
    runnable_now:detonation.runnable_reds,
    true_wait:detonation.true_waits,
    pass_condition:optional(input.pass_condition,2048),
    hard:[
      'SOURCE!=BUILD','BUILD!=RUNTIME','RUNTIME!=LIVE','LIVE!=OUTSIDE_ORIGIN','OUTSIDE_ORIGIN!=HUMAN_USABLE',
      'REPORT!=RETURN','RETURN!=APPLY_RETURN','APPLY_RETURN!=READBACK','READBACK!=BINS','BINS!=REAP'
    ]
  });
}
export const compileFlatplaneCube=FlatplaneCube;

function scaleGate(input={}){
  const required=['10S','100S','00S','MICRO','MESO','MACRO','META'];
  const optional=['MEGA'];
  const values={};
  for(const k of [...required,...optional]){
    const raw=input[k];
    if(raw===undefined&&optional.includes(k))continue;
    values[k]=gateState(raw);
  }
  return values;
}

export function FlatpackPatch(input={}){
  const preflight=arr(input.preflight_gates??[],'preflight_gates').map((g,i)=>{
    if(!g||typeof g!=='object')throw new TypeError('preflight_gate_'+i+'_INVALID');
    return freeze({gate_id:text(g.gate_id,'gate_id'),state:gateState(g.state),evidence_ref:optional(g.evidence_ref,1024)});
  });
  const logic=LogicGateDetonation({target_ref:input.patch_id,gates:input.logic_gates??[],effect_ceiling:input.effect_ceiling??0});
  const scales=scaleGate(input.scale_gates??{});
  const blocking=[...preflight.filter(g=>g.state!=='PASS'),...logic.gates.filter(g=>g.state!=='PASS'),...Object.entries(scales).filter(([,v])=>v!=='PASS').map(([k,v])=>({gate_id:k,state:v}))];
  return freeze({
    schema:FLATPACK_PATCH_SCHEMA,
    patch_id:text(input.patch_id,'patch_id'),
    patch_owner:text(input.patch_owner,'patch_owner'),
    target_red:text(input.target_red,'target_red',1024),
    affected_flatplane_cube:text(input.affected_flatplane_cube,'affected_flatplane_cube'),
    patch_contents:freeze({...input.patch_contents}),
    preflight_gates:preflight,
    logic_gates:logic,
    scale_gates:freeze(scales),
    expected_return:text(input.expected_return,'expected_return',2048),
    apply_return_target:text(input.apply_return_target,'apply_return_target'),
    readback_target:text(input.readback_target,'readback_target'),
    bins_custody_target:text(input.bins_custody_target,'bins_custody_target'),
    reap_target:text(input.reap_target,'reap_target'),
    owner_cog_delta:Number.isFinite(input.owner_cog_delta)?input.owner_cog_delta:0,
    pass_condition:text(input.pass_condition,'pass_condition',2048),
    fail_condition:text(input.fail_condition,'fail_condition',2048),
    true_wait_condition:text(input.true_wait_condition,'true_wait_condition',2048),
    detonation_admitted:blocking.length===0,
    blocking,
    hard:['PATCH_FIXED_ONE_FACE!=CUBE_CLOSED','PREFLIGHT_PASS!=LEGAL_ACCURACY','PACKAGE_EXPORT!=EFFECT_AUTHORITY'],
  });
}
export const compileFlatpackPatch=FlatpackPatch;

export function BlastwaveImpact(input={}){
  const planes={};
  for(const plane of ['MICRO','MESO','MACRO','MEGA','META']){
    const p=input[plane]??{};
    planes[plane]=freeze({
      changed:arr(p.changed??[],plane+'_changed'),
      reds_reduced:arr(p.reds_reduced??[],plane+'_reds_reduced'),
      false_greens_blocked:arr(p.false_greens_blocked??[],plane+'_false_greens_blocked'),
      evidence_refs:arr(p.evidence_refs??[],plane+'_evidence_refs')
    });
  }
  const reap=arr(input.reap??[],'reap');
  return freeze({schema:BLASTWAVE_IMPACT_SCHEMA,patch_id:text(input.patch_id,'patch_id'),planes,reap,owner_cog_delta:Number(input.owner_cog_delta??0),deadline_risk_delta:Number(input.deadline_risk_delta??0)});
}
export const compileBlastwaveImpact=BlastwaveImpact;

export function AftercareCard(input={}){
  return freeze({
    schema:AFTERCARE_CARD_SCHEMA,
    patch_id:text(input.patch_id,'patch_id'),
    what_changed:text(input.what_changed,'what_changed',2048),
    why_it_matters:text(input.why_it_matters,'why_it_matters',2048),
    what_is_now_safe:text(input.what_is_now_safe,'what_is_now_safe',2048),
    what_is_still_red:text(input.what_is_still_red,'what_is_still_red',2048),
    owner_does_not_need_to_do:text(input.owner_does_not_need_to_do,'owner_does_not_need_to_do',2048),
    owner_must_do:optional(input.owner_must_do,2048),
    next_machine_action:text(input.next_machine_action,'next_machine_action',2048),
    next_human_action:optional(input.next_human_action,2048),
    time_saved:Number(input.time_saved??0),
    cog_saved:Number(input.cog_saved??0),
    harm_reduced:Number(input.harm_reduced??0),
    trust_impact:Number(input.trust_impact??0),
  });
}
export const compileAftercareCard=AftercareCard;

export function ReapDebtMeter(input={}){
  const opened=integer(input.opened_units??0,'opened_units');
  const reaped=integer(input.reaped_stew??0,'reaped_stew');
  const ratio=integer(input.ratio??10,'ratio',1,1000);
  const required=opened*ratio;
  const debt=Math.max(0,required-reaped);
  return freeze({schema:REAP_DEBT_METER_SCHEMA,opened_units:opened,reaped_stew:reaped,ratio,required_reap:required,debt,admitted:debt===0,hard:['NO_REAP_NO_OPEN','PROVENANCE_PRESERVED_WHEN_TOMBSTONED']});
}
export const compileReapDebtMeter=ReapDebtMeter;

export function OwnerCogLedger(input={}){
  const metrics={};
  for(const key of ['tic','cog','hope','trust','harm']){
    const v=input[key]??0;if(!Number.isFinite(v))throw new TypeError(key+'_INVALID');metrics[key]=v;
  }
  return freeze({schema:OWNER_COG_LEDGER_SCHEMA,...metrics,owner_cog_delta:metrics.cog,owner_harm_delta:metrics.harm,improved:metrics.cog<=0&&metrics.harm<=0});
}
export const compileOwnerCogLedger=OwnerCogLedger;

export function ProjectionRebaseGate(input={}){
  const generation=text(input.current_generation,'current_generation');
  const projections=arr(input.projections??[],'projections').map((p,i)=>{
    if(!p||typeof p!=='object')throw new TypeError('projection_'+i+'_INVALID');
    const state=text(p.state,'projection_state');
    const terminal=['REAPED','TERMINAL','TRUE_WAIT'].includes(state);
    const current=p.generation_ref===generation;
    return freeze({projection_ref:text(p.projection_ref,'projection_ref'),generation_ref:text(p.generation_ref,'generation_ref'),state,terminal,current,blocks:!terminal&&!current});
  });
  const blockers=projections.filter(p=>p.blocks);
  return freeze({schema:PROJECTION_REBASE_GATE_SCHEMA,current_generation:generation,projections,blockers,pass:blockers.length===0,hard:['ACCEPTED_PATCH=>REBASE_ACTIVE_PROJECTIONS','STALE_ACTIVE_CHILD_BLOCKS_NEXT']});
}
export const compileProjectionRebaseGate=ProjectionRebaseGate;
