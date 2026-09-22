export const ACK_KERNELS=Object.freeze([
  'DISTRIBUTED',
  'ITEM_TRINITY',
  'LOCAL_FIRST',
  'ROOM_ROTATION',
  'ROTFL_TEMPLATE',
  'TWO_SIDED_PROVIDER_METER',
]);

const STATES=new Set(['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE']);
const txt=(v,k,max=512)=>{if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>max)throw new TypeError(k+'_INVALID');return v;};
const refs=v=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&x.trim()))]:[];
const passLike=s=>s==='PASS'||s==='N_A_WITH_EVIDENCE';

function gate(row,k){
  const state=txt(row?.state,k+'_state');
  if(!STATES.has(state))throw new TypeError(k+'_STATE_INVALID');
  const evidence_refs=refs(row?.evidence_refs);
  const wake=typeof row?.wake==='string'&&row.wake.trim()?row.wake.trim():null;
  if(passLike(state)&&!evidence_refs.length)throw new TypeError(k+'_EVIDENCE_REQUIRED');
  if((state==='WAIT'||state==='UNKNOWN')&&!wake)throw new TypeError(k+'_WAKE_REQUIRED');
  return {state,evidence_refs,wake};
}

export function compileRotfToRotflPromotion(input={}){
  const generation=txt(input.generation,'generation');
  const root_ref=txt(input.root_ref,'root_ref');
  const work_ref=txt(input.work_ref,'work_ref');
  const rotf_ref=txt(input.rotf_ref,'rotf_ref');
  const seam_ref=txt(input.seam_ref,'seam_ref');

  const pair=input.even_pair||{};
  const nozzles=Array.isArray(pair.nozzles)?pair.nozzles:[];
  if(nozzles.length!==2)throw new TypeError('EVEN_PAIR_EXACTLY_TWO_NOZZLES_REQUIRED');
  const nozzleIds=new Set();
  const compiledNozzles=nozzles.map((n,i)=>{
    const id=txt(n.id,'nozzle_id_'+i);
    if(nozzleIds.has(id))throw new TypeError('DUPLICATE_NOZZLE_ID');
    nozzleIds.add(id);
    return {
      id,
      role:txt(n.role,'nozzle_role_'+i),
      bound:n.bound===true,
      evidence_refs:refs(n.evidence_refs),
      metric_value:n.metric_value??null,
      interpretation:typeof n.interpretation==='string'?n.interpretation:null,
    };
  });

  const validation=input.validation_nozzle||{};
  const validationNozzle={
    id:txt(validation.id,'validation_nozzle.id'),
    role:txt(validation.role||'VALIDATION','validation_nozzle.role'),
    state:gate(validation,'validation_nozzle'),
  };

  const seam=input.seam_roundtrip||{};
  const forward=gate(seam.forward,'seam_forward');
  const reverse=gate(seam.reverse,'seam_reverse');

  const boring=input.boring||{};
  const boringCells={
    owner_restatement_zero:boring.owner_restatement_count===0,
    manual_routing_zero:boring.manual_routing_count===0,
    ai_reconstruction_zero:boring.ai_reconstruction_count===0,
    chat_replay_zero:boring.chat_replay_required===false,
    silent_remainder_zero:boring.silent_remainder===0,
    current_generation:boring.current_generation===true,
    return_apply_reap_complete:boring.return_apply_reap_complete===true,
    repeatable_without_research:boring.repeatable_without_research===true,
  };
  const boringEvidence=refs(boring.evidence_refs);
  const boringPass=Object.values(boringCells).every(Boolean)&&boringEvidence.length>0;

  const kernels=input.ack_kernels||[];
  const byKernel=new Map();
  for(const row of kernels){
    const id=txt(row.kernel_id,'kernel_id');
    if(byKernel.has(id))throw new TypeError('DUPLICATE_ACK_KERNEL');
    byKernel.set(id,{kernel_id:id,...gate(row,'kernel:'+id)});
  }
  const kernelRows=ACK_KERNELS.map(id=>byKernel.get(id)||{
    kernel_id:id,state:'UNKNOWN',evidence_refs:[],wake:'ACK_KERNEL_NOT_ACCOUNTED'
  });
  const extraKernels=[...byKernel.keys()].filter(id=>!ACK_KERNELS.includes(id));
  const kernelPass=kernelRows.every(r=>passLike(r.state));

  const timeMoneyNozzle=compiledNozzles.find(n=>n.role==='TIME_MONEY');
  const talkActionNozzle=compiledNozzles.find(n=>n.role==='TALK_ACTION');
  const evenPairPass=Boolean(
    timeMoneyNozzle?.bound &&
    talkActionNozzle?.bound &&
    timeMoneyNozzle.evidence_refs.length &&
    talkActionNozzle.evidence_refs.length
  );
  const validationPass=passLike(validationNozzle.state.state);
  const seamPass=passLike(forward.state)&&passLike(reverse.state);

  const blockers=[
    ...(!evenPairPass?['EVEN_PAIR_NOT_BOUND']:[]),
    ...(!validationPass?['VALIDATION_NOZZLE_NOT_PASS']:[]),
    ...(!seamPass?['SEAM_ROUNDTRIP_NOT_PASS']:[]),
    ...(!boringPass?['BORING_GATE_NOT_PASS']:[]),
    ...(!kernelPass?['ACK_KERNEL_DENOMINATOR_NOT_PASS']:[]),
    ...(extraKernels.length?['UNDECLARED_ACK_KERNELS:'+extraKernels.join(',')]:[]),
  ];

  const rotfl=blockers.length===0;
  return Object.freeze({
    schema:'xiio.sdk.rotf-to-rotfl-promotion/v1',
    generation,root_ref,work_ref,rotf_ref,seam_ref,
    stage:rotfl?'ROTFL':'ROTF',
    even_pair:{
      schema:'xiio.nozzle-even/v1',
      denominator:2,
      nozzles:compiledNozzles,
      pass:evenPairPass,
      hard:[
        'EVEN_PAIR_EXACTLY_TWO_NOZZLES',
        'TIME_MONEY_SYMBOL!=BILLING_AUTHORITY',
        'TALK_ACTION_METRIC!=TALK_ACTION_ZERO_BIT',
      ],
    },
    validation_trinity:{
      schema:'xiio.nozzle-validation-trinity/v1',
      denominator:3,
      members:[...compiledNozzles.map(x=>x.id),validationNozzle.id],
      validation_nozzle:validationNozzle,
      pass:evenPairPass&&validationPass,
      hard:[
        'EVEN_PLUS_VALIDATION_NOZZLE=VALIDATION_TRINITY',
        'TRINITY_SHAPE!=LIVE_WORKER_COUNT',
      ],
    },
    seam_roundtrip:{forward,reverse,pass:seamPass},
    boring:{cells:boringCells,evidence_refs:boringEvidence,pass:boringPass},
    ack_kernel_denominator:{
      required:[...ACK_KERNELS],
      denominator:ACK_KERNELS.length,
      pass:kernelRows.filter(r=>passLike(r.state)).length,
      open:kernelRows.filter(r=>!passLike(r.state)).map(r=>r.kernel_id),
      rows:kernelRows,
      complete:kernelPass,
    },
    blockers,
    rotfl,
    authority_granted:false,
    provider_effect:false,
    hard:[
      'ROTF!=ROTFL',
      'LOCAL_CLEVER_LOOP!=ROTFL',
      'BORING_REQUIRED_FOR_ROTFL',
      'ALL_APPLICABLE_ACK_KERNELS_REQUIRED',
      'ONE_WAY_SEAM!=ROTFL',
      'EVEN_WITHOUT_VALIDATION_NOZZLE!=TRINITY',
      'TIME_MONEY_WITHOUT_MEASUREMENT_RATE_BINDING!=MONEY',
      'ROTFL_PROMOTION!=EFFECT_AUTHORITY',
    ],
  });
}
