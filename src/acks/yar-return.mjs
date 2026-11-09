import crypto from 'node:crypto';
export const YAR_SCHEMA='xiio.sdk.yar-return/v1';
const nonempty=v=>typeof v==='string'&&v.length>0&&v.length<=512&&v.trim()===v;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=v=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
export function validateYar(packet={}){
 const errors=[];
 if(packet.schema!==YAR_SCHEMA)errors.push('SCHEMA');
 for(const k of ['ack_ref','root_ref','work_ref','generation','result_ref','return_target_ref','return_ref','apply_return_ref','readback_ref','reap_ref','next_input_ref'])
  if(!nonempty(packet[k]))errors.push('MISSING_'+k.toUpperCase());
 for(const k of ['result_bit','return_bit','apply_bit','readback_bit','reap_bit']){
  if(packet[k]!==0&&packet[k]!==1)errors.push('NOT_BINARY_'+k.toUpperCase());
 }
 if(packet.effect_authority!==0)errors.push('EFFECT_AUTHORITY');
 if(packet.result_bit===0&&[packet.return_bit,packet.apply_bit,packet.readback_bit,packet.reap_bit].some(x=>x===1))errors.push('RESULT_ORDER');
 if(packet.return_bit===0&&[packet.apply_bit,packet.readback_bit,packet.reap_bit].some(x=>x===1))errors.push('RETURN_ORDER');
 if(packet.apply_bit===0&&[packet.readback_bit,packet.reap_bit].some(x=>x===1))errors.push('APPLY_ORDER');
 if(packet.readback_bit===0&&packet.reap_bit===1)errors.push('READBACK_ORDER');
 if(packet.ack_generation!==packet.generation)errors.push('ACK_GENERATION_DRIFT');
 if(packet.returned_root_ref!==packet.root_ref)errors.push('WRONG_HOME');
 if(packet.returned_work_ref!==packet.work_ref)errors.push('WORK_DRIFT');
 if(!Number.isSafeInteger(packet.source_occurrences)||packet.source_occurrences<0)errors.push('OCCURRENCE_COUNT');
 if(packet.returned_source_occurrences!==packet.source_occurrences)errors.push('SOURCE_COUNT_DRIFT');
 if(!Array.isArray(packet.affected_refs)||!Array.isArray(packet.returned_affected_refs))errors.push('AFFECTED_SET_MISSING');
 else{
  const a=new Set(packet.affected_refs),b=new Set(packet.returned_affected_refs);
  if([...a,...b].some(x=>!nonempty(x))||a.size!==packet.affected_refs.length||b.size!==packet.returned_affected_refs.length)errors.push('AFFECTED_SET_INVALID');
  if(packet.returned_affected_refs.some(x=>!a.has(x)))errors.push('AFFECTED_SET_EXPANSION');
  if(packet.reap_bit===1 && (a.size!==b.size||[...a].some(x=>!b.has(x))))errors.push('AFFECTED_SET_UNRESOLVED');
 }
 const lifecycleRefs=['result_ref','return_ref','apply_return_ref','readback_ref','reap_ref'];
 const distinct=lifecycleRefs.map(k=>packet[k]).filter(nonempty);
 if(new Set(distinct).size!==distinct.length)errors.push('LIFECYCLE_REF_REUSE');
 const required=['result_bit','return_bit','apply_bit','readback_bit','reap_bit'];
 const all=required.every(k=>packet[k]===1);
 const suppliedComplete=errors.length===0&&all;
 return Object.freeze({ok:errors.length===0,errors,supplied_complete:suppliedComplete,complete:false,
  verification_state:errors.length?'INVALID':suppliedComplete?'SUPPLIED_UNVERIFIED':'INCOMPLETE',
  first_red:errors[0]||(!all?'YAR_INCOMPLETE':'AUTHENTICATED_RETURN_READBACK_REQUIRED'),
  effect_authority:0,authority_granted:false,provider_effect:false});
}
export function compileYar(packet={}){
 const v=validateYar(packet);
 return Object.freeze({schema:'xiio.sdk.yar-receipt/v1',ack_ref:packet.ack_ref||null,root_ref:packet.root_ref||null,work_ref:packet.work_ref||null,generation:packet.generation||null,return_target_ref:packet.return_target_ref||null,state:v.supplied_complete?'SUPPLIED_UNVERIFIED':v.ok?'OPEN_RETURN':'FAIL_CLOSED',...v,digest:hash(packet),next_input_ref:packet.next_input_ref||null});
}
