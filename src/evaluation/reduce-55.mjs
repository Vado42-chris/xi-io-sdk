// Pure 3->2->1 decision reducer. The authoritative owner must apply the result;
// this SDK function never executes, admits, or mutates an effect.
const present=x=>typeof x==='string'&&x.length>0&&x.length<=256;
export function reduce55({work_id,source_generation,intended,observed,obligations=[],perspectives=[]}={}){
 if(!present(work_id)||!present(source_generation))return {state:'BLOCKED',code:'WORK_ID_OR_GENERATION_MISSING',how:null};
 if(!Array.isArray(obligations)||!Array.isArray(perspectives))return {state:'BLOCKED',code:'INPUT_INVALID',how:null};
 const seen=new Set(),groups=new Map(),micros=[];
 for(const item of obligations){
  if(!present(item?.micro_id)||!present(item?.owner_ref)||!present(item?.difference_code))return {state:'BLOCKED',code:'MICRO_ID_OWNER_OR_DIFFERENCE_MISSING',how:null};
  if(seen.has(item.micro_id))return {state:'BLOCKED',code:'DUPLICATE_MICRO_ID',how:null};
  seen.add(item.micro_id);
  const m={micro_id:item.micro_id,owner_ref:item.owner_ref,difference_code:item.difference_code,evidence_refs:Array.isArray(item.evidence_refs)?item.evidence_refs:[],action_ref:item.action_ref??null,proof_refs:Array.isArray(item.proof_refs)?item.proof_refs:[],blocked_by:Array.isArray(item.blocked_by)?item.blocked_by:[]};
  micros.push(m);
  const key=JSON.stringify([m.owner_ref,m.difference_code,m.action_ref,m.blocked_by.slice().sort(),m.proof_refs.slice().sort()]);
  if(!groups.has(key))groups.set(key,{owner_ref:m.owner_ref,difference_code:m.difference_code,action_ref:m.action_ref,blocked_by:m.blocked_by,proof_refs:m.proof_refs,count:0,micro_ids:[]});
  const g=groups.get(key);g.count++;g.micro_ids.push(m.micro_id);
 }
 const needs=micros.filter(x=>x.difference_code!=='NO_DIFFERENCE');
 const actionable=needs.filter(x=>present(x.action_ref)&&x.blocked_by.length===0&&x.proof_refs.length>0);
 const sorted=actionable.slice().sort((a,b)=>a.micro_id.localeCompare(b.micro_id));
 const how=sorted.length===1?{micro_id:sorted[0].micro_id,owner_ref:sorted[0].owner_ref,action_ref:sorted[0].action_ref,required_proof_refs:sorted[0].proof_refs}:null;
 const state=needs.length===0?'NO_DIFFERENCE':how?'ACTION_CANDIDATE':'BLOCKED';
 const code=needs.length===0?'AWAIT_VERIFIED_EFFECT':how?'ONE_ACTION_PROPOSED':sorted.length>1?'MULTIPLE_ACTIONS_NEED_SELECTION':'NO_QUALIFIED_NEXT_ACTION';
 return {schema:'xiio.sdk.reduction-55/v1',work_id,source_generation,state,code,how,
  intended,observed,observations:perspectives,microstates:micros,
  quantized_groups:[...groups.values()],unresolved_count:needs.length,
  authoritative_transition:false,qualified_effect:false,apply_return:false};
}
