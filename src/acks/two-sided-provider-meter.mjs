export const TWO_SIDED_PROVIDER_METER_SCHEMA='xiio.sdk.two-sided-provider-meter/v1';

const RATE=new Set(['ACTIVE','UNPRICED','MISSING']);
const BUDGET=new Set(['RESERVED','MISSING','EXCEEDED']);
const START=new Set(['READY','WAIT','UNKNOWN']);
const EFFECT=new Set(['PASS','WAIT','DENY']);
const RESULT=new Set(['RESULT','ERROR','WAIT','NONE']);
const USAGE=new Set(['KNOWN','UNKNOWN','MISSING']);
const RECEIPT=new Set(['PRESENT','MISSING','WAIT']);
const RECONCILE=new Set(['PASS','WAIT','UNKNOWN']);

function bool(v,k){ if(typeof v!=='boolean') throw new TypeError(k+'_INVALID'); return v; }
function integer(v,k){ if(!Number.isInteger(v)||v<0) throw new TypeError(k+'_INVALID'); return v; }
function enumv(v,set,k){ if(!set.has(v)) throw new TypeError(k+'_INVALID'); return v; }

export function compileTwoSidedProviderMeterGate(input={}){
  const ingress=input.owner_to_ibal||{};
  const egress=input.ibal_to_provider||{};
  const ret=input.provider_to_ibal||{};

  const ownerIngressOpen=bool(ingress.open,'owner_ingress_open');
  const ownerIngressBlock=String(ingress.typed_block||'').trim()||null;

  const localAvailable=bool(egress.local_available,'local_available');
  const localSubstituteUsed=bool(egress.local_substitute_used,'local_substitute_used');
  const attemptRequested=bool(egress.provider_attempt_requested,'provider_attempt_requested');
  const rate=enumv(egress.rate_card_state,RATE,'rate_card_state');
  const budget=enumv(egress.budget_state,BUDGET,'budget_state');
  const start=enumv(egress.provider_startability,START,'provider_startability');
  const effect=enumv(egress.effect_admission,EFFECT,'effect_admission');

  let egressState='READY', egressNext=null, providerAttemptAllowed=false;
  if(!ownerIngressOpen){
    egressState='WAIT_OWNER_TO_IBAL_INGRESS';
    egressNext=ownerIngressBlock?'WAKE_ON_TYPED_INGRESS_BLOCK':'BIND_TYPED_INGRESS_BLOCK';
  }else if(localAvailable&&localSubstituteUsed){
    egressState='LOCAL_SUBSTITUTE';
    egressNext='RETURN_LOCAL_RESULT';
  }else if(localAvailable&&attemptRequested){
    egressState='FAIL_EXTERNAL_FIRST';
    egressNext='USE_OR_EXPLICITLY_REJECT_LOCAL_SOURCE';
  }else if(rate!=='ACTIVE'){
    egressState='WAIT_RATE_CARD';
    egressNext='BIND_ACTIVE_RATE_CARD_OR_TYPED_UNPRICED_STATE';
  }else if(budget!=='RESERVED'){
    egressState=budget==='EXCEEDED'?'WAIT_BUDGET_EXCEEDED':'WAIT_BUDGET';
    egressNext='RESERVE_BUDGET';
  }else if(start!=='READY'){
    egressState='WAIT_PROVIDER_STARTABILITY';
    egressNext='RECHECK_PROVIDER_STARTABILITY';
  }else if(effect!=='PASS'){
    egressState='WAIT_EFFECT_ADMISSION';
    egressNext=effect==='DENY'?'DO_NOT_ATTEMPT_PROVIDER':'OBTAIN_EFFECT_ADMISSION';
  }else if(!attemptRequested){
    egressState='ATTEMPT_0';
    egressNext='WAIT_FOR_ADMITTED_ATTEMPT_REQUEST';
  }else{
    egressState='ATTEMPT_ADMITTED';
    egressNext='OBSERVE_PROVIDER_RESULT';
    providerAttemptAllowed=true;
  }

  const resultState=enumv(ret.provider_result_state,RESULT,'provider_result_state');
  const usageState=enumv(ret.provider_usage_state,USAGE,'provider_usage_state');
  const measuredTime=integer(ret.measured_time_ms,'measured_time_ms');
  const receiptState=enumv(ret.receipt_state,RECEIPT,'receipt_state');
  const reconciliation=enumv(ret.rate_reconciliation,RECONCILE,'rate_reconciliation');
  const applyRequested=bool(ret.apply_return_requested,'apply_return_requested');

  let returnState='WAIT_PROVIDER_RESULT', returnNext='WAIT_PROVIDER_RESULT';
  let returnAllowed=false, applyReturnAllowed=false;
  if(resultState==='RESULT'||resultState==='ERROR'){
    if(usageState!=='KNOWN'){
      returnState='WAIT_USAGE'; returnNext='BIND_PROVIDER_USAGE_OR_TYPED_UNKNOWN_AND_RECONCILE';
    }else if(receiptState!=='PRESENT'){
      returnState='WAIT_RECEIPT'; returnNext='BIND_PROVIDER_RECEIPT';
    }else if(reconciliation!=='PASS'){
      returnState='WAIT_RATE_RECONCILIATION'; returnNext='RECONCILE_MEASURED_USAGE_TO_ACTIVE_RATE_CARD';
    }else{
      returnState='RETURN_READY'; returnAllowed=true;
      returnNext=applyRequested?'APPLY_RETURN':'RETURN';
      applyReturnAllowed=applyRequested;
    }
  }

  const billingCommitAllowed=returnAllowed&&usageState==='KNOWN'&&receiptState==='PRESENT'&&reconciliation==='PASS';
  const communicationReady=ownerIngressOpen && (providerAttemptAllowed || egressState==='LOCAL_SUBSTITUTE' || egressState==='ATTEMPT_0');

  return Object.freeze({
    schema:TWO_SIDED_PROVIDER_METER_SCHEMA,
    owner_to_ibal:Object.freeze({
      state:ownerIngressOpen?'OPEN':'WAIT_OWNER_TO_IBAL_INGRESS',
      open:ownerIngressOpen,
      typed_block:ownerIngressBlock
    }),
    ibal_to_provider:Object.freeze({
      state:egressState,next:egressNext,
      local_available:localAvailable,local_substitute_used:localSubstituteUsed,
      provider_attempt_requested:attemptRequested,provider_attempt_allowed:providerAttemptAllowed,
      rate_card_state:rate,budget_state:budget,provider_startability:start,effect_admission:effect
    }),
    provider_to_ibal:Object.freeze({
      state:returnState,next:returnNext,provider_result_state:resultState,
      provider_usage_state:usageState,measured_time_ms:measuredTime,receipt_state:receiptState,
      rate_reconciliation:reconciliation,return_allowed:returnAllowed,
      apply_return_allowed:applyReturnAllowed,billing_commit_allowed:billingCommitAllowed
    }),
    communication_ready:communicationReady,
    owner_relay_required:false,
    provider_effect:false,
    effect_authority:0,
    hard:Object.freeze([
      'DO_NOT_EXTERNALIZE_FIRST',
      'INGRESS_OPEN!=EGRESS_OPEN',
      'EGRESS_OPEN!=INGRESS_OPEN',
      'ONE_SIDED_PROVIDER_GATE!=COMMUNICATION_HEALTH',
      'LOCAL_AVAILABLE+EXTERNAL_FIRST=FAIL',
      'BILLING_HOLD=>PROVIDER_ATTEMPT_0',
      'PROVIDER_RESULT!=RETURNED_RESULT',
      'USAGE_UNKNOWN!=ZERO_USAGE',
      'THROTTLED!=SILENT',
      'OWNER_REPEATS_MACHINE_RESOLVABLE_PACKET=UX_FAIL'
    ])
  });
}
