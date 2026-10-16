// Pure SDK projection only. No transport, database or effect authority.
const contexts=new Set(['HOME','WORK','EMPIRE']);
const levels=new Set(['NEWBIE','MODERATE','POWER']);
const delivery=new Set(['NOT_FILED','QUEUED','DELIVERED','CONSUMED']);
const required=['work_id','intent_ref','actor_ref','what','where','when','why','next_how'];
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=512;
export function projectTpsCycle(input={}){
 const missing=required.filter(k=>!text(input[k]));
 const context=contexts.has(input.context)?input.context:'UNKNOWN';
 const proficiency=levels.has(input.proficiency)?input.proficiency:'UNKNOWN';
 const state=delivery.has(input.ai_mail?.state)?input.ai_mail.state:'NOT_FILED';
 const aiMail={state,delivery_id:input.ai_mail?.delivery_id??null,consumer_ack:input.ai_mail?.consumer_ack??null};
 const conflicts=[];
 if(state==='DELIVERED'&&!text(aiMail.delivery_id))conflicts.push('DELIVERY_ID_MISSING');
 if(state==='CONSUMED'&&(!text(aiMail.delivery_id)||!text(aiMail.consumer_ack)))conflicts.push('CONSUMER_PROOF_MISSING');
 if(missing.length)conflicts.push('REQUIRED_CYCLE_FIELDS_MISSING');
 const verifiedConsumption=state==='CONSUMED'&&conflicts.length===0;
 const elapsed=Number.isFinite(input.elapsed_ms)&&input.elapsed_ms>=0?input.elapsed_ms:null;
 const cost=Number.isFinite(input.cost_amount)&&input.cost_amount>=0&&text(input.cost_currency)?{amount:input.cost_amount,currency:input.cost_currency}:null;
 const publicSummary={work_id:input.work_id??null,objective_ref:input.intent_ref??null,context,proficiency,next_action:input.next_how??null,mail_status:state,mail_consumed:verifiedConsumption,elapsed_ms:elapsed,cost};
 const detail={...publicSummary,actor_ref:input.actor_ref??null,work_performed:input.what??null,where:input.where??null,when:input.when??null,why:input.why??null,evidence_refs:Array.isArray(input.evidence_refs)?input.evidence_refs.filter(text):[],delivery_id:aiMail.delivery_id,consumer_ack:aiMail.consumer_ack,conflicts,missing};
 const presentations={
  NEWBIE:{label:'What happened and what happens next',fields:['work_performed','next_action','mail_status']},
  MODERATE:{label:'Workflow and accountability',fields:['work_performed','next_action','mail_status','elapsed_ms','cost']},
  POWER:{label:'Full TP$ and evidence',fields:Object.keys(detail)}
 };
 return {schema:'xiio.sdk.tps-work-projection/v1',qualified_effect:false,ai_mail_filed:(state==='DELIVERED'||state==='CONSUMED')&&text(aiMail.delivery_id),ai_mail_consumed:verifiedConsumption,source_only:true,context,proficiency,summary:publicSummary,detail,presentation:presentations[proficiency]??{label:'Unqualified proficiency',fields:[]}};
}
