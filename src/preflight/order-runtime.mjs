import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ROTFL_ORDER_STEPS,
  compileRotflOrderOfOperations,
  validateRotflOrderOfOperations,
} from './order-of-operations.mjs';

export const ROTFL_RUNTIME_SCHEMA='xiio.sdk.rotfl-order-runtime/v1';

export function defaultRotflOrderStatePath(env=process.env){
  const root=env.XDG_STATE_HOME || path.join(os.homedir(),'.local','state');
  return env.XIIO_OOR_STATE_PATH || path.join(root,'xi-io','rotfl','order.current.json');
}

function writeAtomic(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600});
  fs.renameSync(tmp,file);
}

export function readRotflOrderRuntime({state_path=defaultRotflOrderStatePath()}={}){
  if(!fs.existsSync(state_path)){
    return {
      schema:ROTFL_RUNTIME_SCHEMA,
      state:'TRUE_WAIT',
      state_path,
      first_red:'ROTFL_OOR_RUNTIME_STATE_MISSING',
      mutation_admitted:false,
      provider_effect:false,
      authority_granted:false,
    };
  }
  let order;
  try{order=JSON.parse(fs.readFileSync(state_path,'utf8'));}
  catch(error){
    return {
      schema:ROTFL_RUNTIME_SCHEMA,
      state:'FAIL',
      state_path,
      first_red:'ROTFL_OOR_RUNTIME_STATE_INVALID_JSON',
      detail:String(error?.message||error),
      mutation_admitted:false,
      provider_effect:false,
      authority_granted:false,
    };
  }
  const verdict=validateRotflOrderOfOperations(order);
  return {
    schema:ROTFL_RUNTIME_SCHEMA,
    state:verdict.ok?'PASS':'FAIL',
    state_path,
    order,
    verdict,
    mutation_admitted:verdict.ok && order.mutation_admitted===true,
    provider_effect:false,
    authority_granted:false,
    first_red:verdict.ok?null:(verdict.errors[0]||'ROTFL_OOR_RUNTIME_INVALID'),
  };
}

export function initializeRotflOrderRuntime({
  source_generation,
  managed_current,
  state_path=defaultRotflOrderStatePath(),
}={}){
  const order=compileRotflOrderOfOperations({
    source_generation,
    managed_current,
    completed_step_ids:[],
    evidence_refs:{},
    preflight_refs:{},
  });
  writeAtomic(state_path,order);
  return {
    schema:ROTFL_RUNTIME_SCHEMA,
    state:'PASS',
    action:'INIT',
    state_path,
    order,
    mutation_admitted:false,
    provider_effect:false,
    authority_granted:false,
  };
}

export function advanceRotflOrderRuntime({
  step_id,
  evidence_ref,
  preflight_ref,
  current_source_generation,
  state_path=defaultRotflOrderStatePath(),
}={}){
  const current=readRotflOrderRuntime({state_path});
  if(current.state!=='PASS') return {...current,action:'ADVANCE',advanced:false};
  const order=current.order;
  const verdict=current.verdict;
  if(current_source_generation && order.source_generation!==current_source_generation){
    return {
      schema:ROTFL_RUNTIME_SCHEMA,
      state:'FAIL_CURRENT',
      action:'ADVANCE',
      advanced:false,
      state_path,
      first_red:'ROTFL_OOR_SOURCE_GENERATION_DRIFT',
      expected:current_source_generation,
      observed:order.source_generation,
      mutation_admitted:false,
      provider_effect:false,
      authority_granted:false,
    };
  }
  const expected=verdict.next_step_id;
  if(!expected || step_id!==expected){
    return {
      schema:ROTFL_RUNTIME_SCHEMA,
      state:'FAIL',
      action:'ADVANCE',
      advanced:false,
      state_path,
      first_red:'ROTFL_OOR_ADVANCE_NOT_NEXT_STEP',
      expected_step_id:expected,
      supplied_step_id:step_id||null,
      mutation_admitted:false,
      provider_effect:false,
      authority_granted:false,
    };
  }
  if(typeof evidence_ref!=='string'||!evidence_ref.trim()||typeof preflight_ref!=='string'||!preflight_ref.trim()){
    return {
      schema:ROTFL_RUNTIME_SCHEMA,
      state:'FAIL',
      action:'ADVANCE',
      advanced:false,
      state_path,
      first_red:'ROTFL_OOR_ADVANCE_REQUIRES_EVIDENCE_AND_PREFLIGHT',
      expected_step_id:expected,
      mutation_admitted:false,
      provider_effect:false,
      authority_granted:false,
    };
  }
  const evidence={...(order.evidence_refs||{}),[step_id]:[...new Set([...(order.evidence_refs?.[step_id]||[]),evidence_ref])]};
  const preflight={...(order.preflight_refs||{}),[step_id]:[...new Set([...(order.preflight_refs?.[step_id]||[]),preflight_ref])]};
  const next=compileRotflOrderOfOperations({
    source_generation:order.source_generation,
    managed_current:order.managed_current,
    completed_step_ids:[...(order.completed_step_ids||[]),step_id],
    evidence_refs:evidence,
    preflight_refs:preflight,
  });
  writeAtomic(state_path,next);
  return {
    schema:ROTFL_RUNTIME_SCHEMA,
    state:'PASS',
    action:'ADVANCE',
    advanced:true,
    state_path,
    completed_step_id:step_id,
    next_step_id:next.current_step_id,
    order:next,
    mutation_admitted:next.mutation_admitted===true,
    provider_effect:false,
    authority_granted:false,
  };
}

export function requireRotflMutationAdmission({
  current_source_generation,
  state_path=defaultRotflOrderStatePath(),
}={}){
  const current=readRotflOrderRuntime({state_path});
  const fail=(first_red,extra={})=>({
    schema:'xiio.sdk.rotfl-mutation-admission/v1',
    admitted:false,
    state:'BLOCKED',
    state_path,
    first_red,
    ...extra,
    provider_effect:false,
    authority_granted:false,
  });
  if(current.state!=='PASS') return fail(current.first_red||'ROTFL_OOR_RUNTIME_NOT_CURRENT');
  if(current_source_generation && current.order.source_generation!==current_source_generation){
    return fail('ROTFL_OOR_SOURCE_GENERATION_DRIFT',{
      expected:current_source_generation,
      observed:current.order.source_generation,
    });
  }
  if(current.order.mutation_admitted!==true || current.verdict.pre_attempt_ready!==true){
    return fail('ROTFL_OOR_O11_NOT_COMPLETE',{
      current_step_id:current.order.current_step_id,
      completed_step_ids:current.order.completed_step_ids,
    });
  }
  return {
    schema:'xiio.sdk.rotfl-mutation-admission/v1',
    admitted:true,
    state:'PASS',
    state_path,
    source_generation:current.order.source_generation,
    completed_step_ids:current.order.completed_step_ids,
    current_step_id:current.order.current_step_id,
    provider_effect:false,
    authority_granted:false,
    hard:[
      'OOR_ADMISSION!=EFFECT_AUTHORITY',
      'O11_COMPLETE!=O12_RETURN_COMPLETE',
      'MUTATION_ADMITTED!=PROVIDER_EFFECT',
    ],
  };
}

export function rotflMutationCommandClass(argv=[]){
  const args=argv.map(String);
  const top=args[0]||null;
  if(!top) return {mutation:false,reason:'NO_COMMAND'};
  if(top==='ack'&&args[1]==='order') return {mutation:false,reason:'OOR_CONTROL_PLANE'};
  if(args.includes('--execute')) return {mutation:true,reason:'EXPLICIT_EXECUTE'};
  if(top==='pneuma'&&args.includes('--exec-rotfl')) return {mutation:true,reason:'PNEUMA_EXEC_ROTFL'};
  if(top==='zed'&&args[1]==='ibal'&&args[2]==='recover') return {mutation:true,reason:'ZED_IBAL_RECOVER'};
  if(top==='runner'&&args[1]==='recover') return {mutation:true,reason:'RUNNER_RECOVER'};
  if(top==='inbox'&&['recover'].includes(args[1])) return {mutation:true,reason:'INBOX_RECOVER'};
  if(top==='hex'&&['install','start'].includes(args[1])) return {mutation:true,reason:'HEX_RUNTIME_MUTATION'};
  if(top==='studio'&&['start'].includes(args[1])) return {mutation:true,reason:'STUDIO_RUNTIME_MUTATION'};
  return {mutation:false,reason:'READ_OR_NONMUTATING_COMMAND'};
}
