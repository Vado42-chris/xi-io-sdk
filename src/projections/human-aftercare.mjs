const STATES=new Set(['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE']);
const SCALES=['MICRO','MESO','MACRO','META'];
const txt=(v,n)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(n+' required');return v.trim()};
const arr=v=>Array.isArray(v)?v:[];
export function compileHumanAftercare(input={}){
 const requirements=arr(input.requirements).map((r,i)=>({
  id:txt(r.id,'requirements['+i+'].id'),label:txt(r.label,'requirements['+i+'].label'),
  state:STATES.has(r.state)?r.state:'UNKNOWN',evidence_ref:r.evidence_ref??null,next_action:r.next_action??null
 }));
 const templates=arr(input.templates).map((t,i)=>({id:txt(t.id,'templates['+i+'].id'),title:txt(t.title,'templates['+i+'].title'),purpose:txt(t.purpose,'templates['+i+'].purpose'),surface_ref:t.surface_ref??null,state:STATES.has(t.state)?t.state:'UNKNOWN'}));
 const impact=Object.fromEntries(SCALES.map(s=>[s,{state:STATES.has(input.impact?.[s]?.state)?input.impact[s].state:'UNKNOWN',affected_refs:arr(input.impact?.[s]?.affected_refs),evidence_refs:arr(input.impact?.[s]?.evidence_refs),next_action:input.impact?.[s]?.next_action??null}]));
 const open=requirements.filter(r=>!['PASS','N_A_WITH_EVIDENCE'].includes(r.state));
 const missingTemplates=templates.filter(t=>!['PASS','N_A_WITH_EVIDENCE'].includes(t.state));
 return {schema:'xiio.sdk.human-aftercare/v1',subject_ref:txt(input.subject_ref,'subject_ref'),generation:txt(input.generation,'generation'),
  start_here:{what_changed:input.what_changed??null,what_human_should_do_now:input.what_human_should_do_now??null,what_not_to_do:arr(input.what_not_to_do),resume_pointer:input.resume_pointer??null},
  requirements:{denominator:requirements.length,resolved:requirements.length-open.length,open:open.length,items:requirements},
  templates:{denominator:templates.length,usable:templates.length-missingTemplates.length,missing_or_unverified:missingTemplates.length,items:templates},
  blastwave:{scales:impact,all_scales_terminal:SCALES.every(s=>['PASS','N_A_WITH_EVIDENCE'].includes(impact[s].state))},
  aftercare_ready:open.length===0&&missingTemplates.length===0&&SCALES.every(s=>['PASS','N_A_WITH_EVIDENCE'].includes(impact[s].state)),
  hard:['INTERNAL_CONTROL_DUMP != HUMAN_AFTERCARE','AFTERCARE_DOC_PRESENT != HUMAN_USABLE_TEMPLATE','MICRO_PASS != MESO_PASS != MACRO_PASS != META_PASS','REQUIREMENT_WITHOUT_CURRENT_EVIDENCE != PASS','TEMPLATE_MISSING != AFTERCARE_READY','AFTERCARE_READY != EFFECT_AUTHORITY']};
}
