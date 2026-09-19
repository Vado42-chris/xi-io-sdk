import crypto from 'node:crypto';

export const ROTFL_ACK_TEMPLATE_RUN_SCHEMA='xiio.sdk.rotfl-ack-template-run/v1';
export const ROTFL_ACK_TEMPLATE_ROUTE_SCHEMA='xiio.sdk.rotfl-ack-template-route/v1';

const STATES=new Set(['EXECUTED','WAIT','FAIL','UNKNOWN']);
const bounded=(v,max=512)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max;
const bit=(v,k)=>{if(v!==0&&v!==1)throw new TypeError(k+' must be 0|1');return v;};
const stable=(v)=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=(v)=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

export function validateRotflAckTemplateRuns(templateRefs,runs){
  const errors=[];
  if(!Array.isArray(templateRefs)||templateRefs.length===0||templateRefs.some(x=>!bounded(x))) errors.push('TEMPLATE_REFS_INVALID');
  if(!Array.isArray(runs)||runs.length===0) errors.push('TEMPLATE_RUNS_MISSING');
  if(errors.length) return {ok:false,errors,runtime_complete:false,run_count:Array.isArray(runs)?runs.length:0};
  const refSet=new Set(templateRefs);
  if(refSet.size!==templateRefs.length) errors.push('TEMPLATE_REFS_DUPLICATE');
  const seen=new Set();
  let runtimeComplete=true;
  for(const [i,run] of runs.entries()){
    if(!run||typeof run!=='object'||Array.isArray(run)){errors.push('TEMPLATE_RUN_INVALID:'+i);runtimeComplete=false;continue;}
    if(run.schema!==ROTFL_ACK_TEMPLATE_RUN_SCHEMA) errors.push('TEMPLATE_RUN_SCHEMA_INVALID:'+i);
    if(!bounded(run.template_ref)) errors.push('TEMPLATE_REF_INVALID:'+i);
    else {
      if(seen.has(run.template_ref)) errors.push('TEMPLATE_RUN_DUPLICATE:'+run.template_ref);
      seen.add(run.template_ref);
      if(!refSet.has(run.template_ref)) errors.push('TEMPLATE_RUN_UNDECLARED:'+run.template_ref);
    }
    for(const k of ['template_generation','runtime_ref','runtime_generation','runtime_rotfl_receipt_ref','runtime_readback_ref','next_input_ref']){
      if(!bounded(run[k])) errors.push('TEMPLATE_RUN_REF_INVALID:'+k+':'+i);
    }
    if(!STATES.has(run.state)) errors.push('TEMPLATE_RUN_STATE_INVALID:'+i);
    let known=0,value=0,talk=0,time=0;
    try{
      known=bit(run.known_bit,'known_bit');
      value=bit(run.value_bit,'value_bit');
      talk=bit(run.talk_action_zero_bit,'talk_action_zero_bit');
      time=bit(run.time_money_bound_bit,'time_money_bound_bit');
    }catch(e){errors.push('TEMPLATE_RUN_BINARY_INVALID:'+i);}
    if(known===0&&value===1) errors.push('TEMPLATE_RUN_UNKNOWN_VALUE_ONE:'+i);
    const pass=run.state==='EXECUTED'&&known===1&&value===1&&talk===1&&time===1;
    if(!pass) runtimeComplete=false;
  }
  for(const ref of refSet) if(!seen.has(ref)){errors.push('TEMPLATE_RUN_MISSING:'+ref);runtimeComplete=false;}
  return {ok:errors.length===0,errors,runtime_complete:errors.length===0&&runtimeComplete,run_count:runs.length};
}

export function compileRotflAckTemplateRoute({item_ref,rotfl}={}){
  if(!bounded(item_ref)) throw new TypeError('item_ref required');
  const verdict=validateRotflAckTemplateRuns(rotfl?.reusable_template_refs,rotfl?.template_runs);
  if(!verdict.ok) throw new TypeError('ROTFL ACK template runs invalid: '+verdict.errors.join('|'));
  const runs=rotfl.template_runs.map(run=>({
    template_ref:run.template_ref,
    template_generation:run.template_generation,
    runtime_ref:run.runtime_ref,
    runtime_generation:run.runtime_generation,
    state:run.state,
    known_bit:run.known_bit,
    value_bit:run.value_bit,
    talk_action_zero_bit:run.talk_action_zero_bit,
    time_money_bound_bit:run.time_money_bound_bit,
    runtime_rotfl_receipt_ref:run.runtime_rotfl_receipt_ref,
    runtime_readback_ref:run.runtime_readback_ref,
    next_input_ref:run.next_input_ref,
    pass_bit:run.state==='EXECUTED'&&run.known_bit===1&&run.value_bit===1&&run.talk_action_zero_bit===1&&run.time_money_bound_bit===1?1:0,
  }));
  return Object.freeze({
    schema:ROTFL_ACK_TEMPLATE_ROUTE_SCHEMA,
    route_id:digest({item_ref,templates:runs.map(x=>[x.template_ref,x.template_generation,x.runtime_generation])}),
    item_ref,
    template_denominator:runs.length,
    template_pass:runs.reduce((n,x)=>n+x.pass_bit,0),
    template_zero:runs.reduce((n,x)=>n+(x.pass_bit===1?0:1),0),
    runtime_complete:verdict.runtime_complete,
    runs,
    authority_granted:false,
    provider_effect:false,
    hard:Object.freeze([
      'ACK_TEMPLATE_REF!=ACK_TEMPLATE_EXECUTED',
      'ACK_TEMPLATE_EXECUTED_REQUIRES_RUNTIME_ROTFL_RECEIPT',
      'TALK_ACTION_ZERO_BIT=0->NO_TEMPLATE_PASS',
      'TIME_MONEY_BOUND_BIT=0->NO_TEMPLATE_PASS',
      'TEMPLATE_RUN_UNKNOWN!=PASS',
      'TEMPLATE_RUNTIME_PASS!=EFFECT_AUTHORITY'
    ])
  });
}
