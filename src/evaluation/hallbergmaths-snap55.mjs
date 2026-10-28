// HallbergMaths 5.5 SNAP: source-preserving, application-neutral audit adapter.
// Does not replace the historical Field Guide implementation or assert clinical validity.
export const FIBONACCI_WEIGHTS = Object.freeze([13,8,5,3,2,1,1]);
export const LEGACY_DECAY_HOURS = 18;
export const ACTUAL_LEGACY_HALF_LIFE_HOURS = LEGACY_DECAY_HOURS * Math.LN2;
const known = (value) => ({KNOWN_BIT: 1, VALUE_BIT: value ? 1 : 0});
const unknown = () => ({KNOWN_BIT: 0, VALUE_BIT: 0});
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const PILLAR_IDS = Object.freeze(["autism","adhd","masking","burnout"]);
const DECAY_MODES = Object.freeze(["legacy_efold18","half_life18"]);
export function maskedResponse(responses, id) {
  if (!Object.prototype.hasOwnProperty.call(responses || {}, id)) return {bit:unknown(), value:null, reason:"ABSENT"};
  const value=responses[id];
  if (!finite(value) || value<0 || value>4) return {bit:unknown(),value:null,reason:"INVALID_RESPONSE"};
  return {bit:known(true),value,reason:"PRESENT"};
}
export function temporalWeight(ageHours, mode="legacy_efold18") {
  if (!finite(ageHours)) return {bit:unknown(),weight:null,reason:"INVALID_AGE"};
  if (ageHours<0 || ageHours>72) return {bit:known(false),weight:null,reason:ageHours<0?"FUTURE_DATED":"OUT_OF_WINDOW"};
  if (mode==="legacy_efold18") return {bit:known(true),weight:Math.exp(-ageHours/18),reason:"LEGACY_18H_EFOLD"};
  if (mode==="half_life18") return {bit:known(true),weight:Math.pow(2,-ageHours/18),reason:"EXPLICIT_18H_HALF_LIFE"};
  return {bit:unknown(),weight:null,reason:"UNKNOWN_DECAY_MODE"};
}
export function snap55({questions=[],responses={},journal=[],nowMs=Date.now(),decayMode="legacy_efold18"}={}) {
  if(!Array.isArray(questions)||!Array.isArray(journal)||!finite(nowMs)||
    !responses||typeof responses!=="object"||Array.isArray(responses)) throw new TypeError("SNAP_INPUT_INVALID");
  // Source identity and denominator must be unambiguous before assigning coordinates.
  // A duplicated question must not inflate the known-response score.
  const seenIds=new Set();
  for(const question of questions) {
    if(!question||typeof question.id!=="string"||!question.id.trim()||
      !PILLAR_IDS.includes(question.pillar)) throw new TypeError("SNAP_QUESTION_INVALID");
    if(seenIds.has(question.id)) throw new TypeError("SNAP_DUPLICATE_QUESTION_ID");
    seenIds.add(question.id);
  }
  const decayModeSupported=DECAY_MODES.includes(decayMode);
  const cells=questions.map((q,i)=>({
    coordinate:i,id:q?.id??null,pillar:q?.pillar??null,weight:FIBONACCI_WEIGHTS[i]??1,
    response:maskedResponse(responses,q?.id),source_index:i
  }));
  const missing=cells.filter(c=>c.response.bit.KNOWN_BIT===0).map(c=>c.id);
  const pillars=Object.fromEntries(PILLAR_IDS.map(p=>{
    const cs=cells.filter(c=>c.pillar===p);
    const numerator=cs.reduce((sum,c)=>sum+(c.response.bit.KNOWN_BIT?c.response.value*c.weight:0),0);
    const denominator=cs.reduce((sum,c)=>sum+4*c.weight,0);
    return [p,{sum:numerator,max:denominator,known_count:cs.length-missing.filter(id=>cs.some(c=>c.id===id)).length,required_count:cs.length,
      percent:cs.length && cs.every(c=>c.response.bit.KNOWN_BIT===1)&&denominator>0 ?100*numerator/denominator:null}];
  }));
  const recent=journal.map((entry,i)=>({index:i,entropy:entry?.sensoryEntropy,ageHours:(nowMs-entry?.timestamp)/3600000,
    time:temporalWeight((nowMs-entry?.timestamp)/3600000,decayMode)}));
  const invalidJournal=recent.some(r=>r.time.bit.KNOWN_BIT===0||
    (r.time.bit.VALUE_BIT===1&&(!finite(r.entropy)||r.entropy<0||r.entropy>100)));
  const included=recent.filter(r=>r.time.bit.KNOWN_BIT===1&&r.time.bit.VALUE_BIT===1&&finite(r.entropy)&&r.entropy>=0&&r.entropy<=100);
  const sumW=included.reduce((s,r)=>s+r.time.weight,0);
  const recentEntropy=sumW>0?included.reduce((s,r)=>s+(r.entropy/100)*r.time.weight,0)/sumW:0;
  const baselineMax=Object.values(pillars).reduce((s,p)=>s+p.max,0);
  const baselineSum=Object.values(pillars).reduce((s,p)=>s+p.sum,0);
  const baselineKnown=missing.length===0 && cells.length>0;
  const baseline=baselineKnown&&baselineMax>0?baselineSum/baselineMax:null;
  const confidence=questions.length?Math.round(100*(cells.length-missing.length)/questions.length):null;
  const state=!decayModeSupported?"UNKNOWN_DECAY_MODE":
    invalidJournal?"UNKNOWN_JOURNAL_DATA":
    baselineKnown?"SOURCE_BOUND_NUMERIC":"UNKNOWN_REQUIRED_RESPONSES";
  const R=state==="SOURCE_BOUND_NUMERIC"?0.25*baseline+0.65*recentEntropy+0.1*0.05:null;
  return {schema:"xiio.rotfl.snap55.hallbergmaths/v1",state,source_model:"FIELD_GUIDE_HISTORICAL",
    effect_authority:0,decay_mode:decayMode,legacy_half_life_hours:ACTUAL_LEGACY_HALF_LIFE_HOURS,
    weight_sum:FIBONACCI_WEIGHTS.reduce((a,b)=>a+b,0),question_denominator:questions.length,known_count:cells.length-missing.length,
    missing,confidence,baseline,recent_entropy:decayModeSupported&&!invalidJournal?recentEntropy:null,R,cells,pillars,
    excluded_future:recent.filter(x=>x.time.reason==="FUTURE_DATED").length,
    limitations:["APPLICATION_HEURISTIC_NOT_MATHEMATICAL_THEORY_PROOF","NO_CLINICAL_VALIDATION","NO_LIVE_TASK_ALGORITHM_IDENTITY_JOIN","LEGACY_WEIGHTS_DEPEND_ON_ARRAY_ORDER"]};
}
