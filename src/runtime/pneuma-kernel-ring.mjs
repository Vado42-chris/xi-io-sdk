const PASSISH=new Set(['PASS','N_A_WITH_EVIDENCE']);
const FAILISH=new Set(['FAIL','FAIL_CURRENT','BLOCKED','REJECTED']);
const WAITISH=new Set(['WAIT','TRUE_WAIT','UNKNOWN','MISSING','']);

const t=(v)=>typeof v==='string'&&v.trim()?v.trim():null;
const s=(v)=>String(v||'UNKNOWN').toUpperCase();

export function evaluatePneumaKernelRing(packet={},projectionChain=[]){
  const ring=packet.kernel_ring||{};
  const generation=t(ring.generation);
  const digest=t(ring.digest);
  const spineRef=t(ring.spine_ref);
  const xRef=t(ring.x_cross_ref);
  const spinOutRef=t(ring.spin_out_ref);
  const spinBackRef=t(ring.spin_back_ref);
  const reciprocalRef=t(ring.reciprocal_ref);
  const ibalRef=t(ring.ibal_ref);
  const comsRef=t(ring.coms_ref);
  const top=s(ring.audhd?.state);
  const cross=s(ring.switchboard?.state);
  const bottom=s(ring.ward?.state);

  if(!generation) return {state:'TRUE_WAIT',first_red:'KERNEL_RING_GENERATION_MISSING'};
  if(!digest) return {state:'TRUE_WAIT',first_red:'KERNEL_RING_DIGEST_MISSING'};
  if(!spineRef) return {state:'TRUE_WAIT',first_red:'KERNEL_SPINE_REF_MISSING'};
  if(!xRef) return {state:'TRUE_WAIT',first_red:'KERNEL_X_CROSS_REF_MISSING'};
  if(!spinOutRef||!spinBackRef||!reciprocalRef) return {state:'TRUE_WAIT',first_red:'RECIPROCAL_SPIN_REFS_MISSING'};

  if(FAILISH.has(top)) return {state:'FAIL',first_red:'UX_TOP_TOO_COMPLICATED',generation,digest};
  if(FAILISH.has(cross)) return {state:'FAIL',first_red:'UX_SWITCHBOARD_X_FAIL',generation,digest};
  if(FAILISH.has(bottom)) return {state:'FAIL',first_red:'UX_BOTTOM_TOO_WEAK',generation,digest};

  if(WAITISH.has(top)) return {state:'TRUE_WAIT',first_red:'UX_TOP_COMPLEXITY_NOT_PROVEN',generation,digest};
  if(WAITISH.has(cross)) return {state:'TRUE_WAIT',first_red:'UX_SWITCHBOARD_X_NOT_PROVEN',generation,digest};
  if(WAITISH.has(bottom)) return {state:'TRUE_WAIT',first_red:'UX_BOTTOM_STRENGTH_NOT_PROVEN',generation,digest};
  if(!PASSISH.has(top)||!PASSISH.has(cross)||!PASSISH.has(bottom)) return {state:'TRUE_WAIT',first_red:'UX_TRINITY_STATE_UNRESOLVED',generation,digest};
  if(!ibalRef) return {state:'TRUE_WAIT',first_red:'UX_IBAL_OBSERVER_REF_MISSING',generation,digest};
  if(!comsRef) return {state:'TRUE_WAIT',first_red:'UX_COMS_RETURN_REF_MISSING',generation,digest};

  for(let i=0;i<projectionChain.length;i++){
    const row=projectionChain[i]||{};
    if(row.kernel_ring_generation!==generation) return {state:'FAIL',first_red:'KERNEL_RING_GENERATION_DRIFT',failed_depth:i+1,generation,digest};
    if(row.kernel_ring_digest!==digest) return {state:'FAIL',first_red:'KERNEL_RING_DIGEST_DRIFT',failed_depth:i+1,generation,digest};
  }

  return {
    state:'PASS',
    first_red:null,
    generation,
    digest,
    spine_ref:spineRef,
    x_cross_ref:xRef,
    spin_out_ref:spinOutRef,
    spin_back_ref:spinBackRef,
    reciprocal_ref:reciprocalRef,
    audhd_ref:ring.audhd?.evidence_ref||null,
    switchboard_ref:ring.switchboard?.evidence_ref||null,
    ward_ref:ring.ward?.evidence_ref||null,
    ibal_ref:ibalRef,
    coms_ref:comsRef,
    verified_depth:projectionChain.length,
    effect_authority:0,
    hard:[
      'SPINE!=SPIN',
      'PNEUMA_PIVOT!=RESET',
      'ONE_WAY_PASS!=RECIPROCAL_PASS',
      'AUDHD_TOP_FAIL=>TOO_COMPLICATED',
      'WARD_BOTTOM_FAIL=>TOO_WEAK',
      'SWITCHBOARD_X_FAIL=>UX_OVERLAP_NOT_PROVEN',
      'IBAL_VISIBILITY!=AUTHORITY',
      'COMS!=RUNTIME_TRUTH'
    ]
  };
}
