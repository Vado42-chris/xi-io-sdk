export const EVEN_X_ONBOARDING_PROJECTION_SCHEMA='xiio.sdk.even-x-onboarding-projection/v1';

const EVEN=new Set([2,4,6,8,10]);
const RESULTS=new Set(['SAME','DRIFT','WAIT','BLOCKED','N_A_WITH_EVIDENCE']);

function text(v,k){
  const s=String(v??'').trim();
  if(!s) throw new TypeError(k+'_REQUIRED');
  return s;
}

export function compileEvenXOnboardingProjection(input={}){
  const subject_ref=text(input.subject_ref,'SUBJECT_REF');
  const generation_ref=text(input.generation_ref,'GENERATION_REF');
  const framework_contract_ref=text(input.framework_contract_ref,'FRAMEWORK_CONTRACT_REF');
  if(!Array.isArray(input.rows)||input.rows.length===0) throw new TypeError('ROWS_REQUIRED');

  const rows=input.rows.map((row,i)=>{
    const even=Number(row.even);
    if(!EVEN.has(even)) throw new TypeError('ROW_'+i+'_EVEN_INVALID');
    const flat_state=text(row.flat_state,'ROW_'+i+'_FLAT_STATE');
    const x_cross_ref=text(row.x_cross_ref,'ROW_'+i+'_X_CROSS_REF');
    const x_state=text(row.x_state,'ROW_'+i+'_X_STATE');
    const result=text(row.result,'ROW_'+i+'_RESULT');
    if(!RESULTS.has(result)) throw new TypeError('ROW_'+i+'_RESULT_INVALID');
    return Object.freeze({even,flat_state,x_cross_ref,x_state,result});
  });

  const blocking=rows.filter(r=>!['SAME','N_A_WITH_EVIDENCE'].includes(r.result));
  return Object.freeze({
    schema:EVEN_X_ONBOARDING_PROJECTION_SCHEMA,
    subject_ref,
    generation_ref,
    framework_contract_ref,
    rows:Object.freeze(rows),
    eligible_to_continue:blocking.length===0,
    blocking_evens:Object.freeze(blocking.map(r=>r.even)),
    geometry_owner:'xi-io.net:standards/onboarding/even-x-cross-onboarding.v1.json',
    projection_owner:'@xi-io/sdk',
    authority_granted:false,
    runtime_credit:false,
    effect_authority:false,
    hard:Object.freeze([
      'SDK_PROJECTION!=GEOMETRY_OWNER',
      'EVEN=FLAT_PLANE',
      'X=CROSS',
      'NO_X=>NO_CLOSURE',
      'SOURCE_PASS!=RUNTIME_PASS',
      'PROJECTION_COUNT!=WITNESS_COUNT'
    ])
  });
}

export function verifyEvenXOnboardingProjection(value={}){
  if(value.schema!==EVEN_X_ONBOARDING_PROJECTION_SCHEMA) return Object.freeze({state:'FAIL',reason:'SCHEMA'});
  const rows=Array.isArray(value.rows)?value.rows:[];
  const checks={
    SUBJECT:typeof value.subject_ref==='string'&&value.subject_ref.length>0,
    GENERATION:typeof value.generation_ref==='string'&&value.generation_ref.length>0,
    FRAMEWORK:typeof value.framework_contract_ref==='string'&&value.framework_contract_ref.length>0,
    ROWS:rows.length>0,
    EVEN:rows.every(r=>EVEN.has(Number(r.even))),
    X:rows.every(r=>typeof r.x_cross_ref==='string'&&r.x_cross_ref.length>0),
    RESULT:rows.every(r=>RESULTS.has(r.result)),
    AUTHORITY:value.authority_granted===false&&value.runtime_credit===false&&value.effect_authority===false
  };
  const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
  return Object.freeze({schema:'xiio.sdk.even-x-onboarding-verification/v1',state:failed.length?'FAIL':'PASS',checks:Object.freeze(checks),failed:Object.freeze(failed),effect_authority:0});
}
