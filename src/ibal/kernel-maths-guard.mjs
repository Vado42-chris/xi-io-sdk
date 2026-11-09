// KM1–KM21 structural gate over an exact, READ-ONLY recovered source donor.
// This does not grant Ward, session, runtime, release or external-effect authority.
// Original Node copy: research/recovered/base44-kernel-maths-km1-km21.mjs
import {
  stepCycle, planeSeams, cubeSeams, enumerateSeams, crossing, stack,
  lineageId, instanceId, seamId, relativePosition, doubling, closesLoop,
} from '../../research/recovered/base44-kernel-maths-km1-km21.mjs';

const schema = 'xiio.sdk.km-structural-guard/v1';
const MAX_DIGITS = 64;
const ZERO_SHA = '0'.repeat(64);
const isSafe = x => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const id = x => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(x);
const sha = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x) && x !== ZERO_SHA;
const reject = reason => Object.freeze({schema, status:'REFUSED', reason, authority_granted:false, provider_effect:false, verified:false});
const computed = (op,result,extra={}) => Object.freeze({
  schema,status:'COMPUTED',operation:op,result,provider_effect:false,authority_granted:false,verified:false,...extra,
});

export function compileKmCycle(digits) {
  if (!Array.isArray(digits) || digits.length < 1 || digits.length > MAX_DIGITS ||
      digits.some(x => !isSafe(x) || x > 9)) return reject('KM1_DIGITS_INVALID');
  const result=stepCycle(digits);
  return computed('KM1_STEP_CYCLE',{digits:result,exact_decimal:result.slice().reverse().join('')});
}

export function compileKmSeams(n, dimension) {
  if (!isSafe(n) || n < 1 || n > 1_000_000 || ![2,3].includes(dimension)) return reject('KM4_KM6_BOUNDS');
  const v=BigInt(n);
  const result=dimension===2
    ? {paired:(2n*v*(v-1n)).toString(),open:(4n*v).toString()}
    : {paired:(3n*v*v*(v-1n)).toString(),open:(6n*v*v).toString()};
  if (n<=4) {
    const independentlyEnumerated=enumerateSeams(n,dimension);
    if (independentlyEnumerated[0]!==Number(result.paired) ||
        independentlyEnumerated[1]!==Number(result.open)) return reject('KM_SEAM_ENUMERATOR_CONFLICT');
    const donor=dimension===2?planeSeams(n):cubeSeams(n);
    if (donor[0]!==Number(result.paired)||donor[1]!==Number(result.open))
      return reject('KM_SEAM_DONOR_CONFLICT');
  }
  return computed('KM4_KM6_SEAMS',{n,dimension,...result,balanced:result.paired===result.open});
}

function evidence(x) {
  return x && Object.getPrototypeOf(x)===Object.prototype &&
    id(x.cube) && isSafe(x.gen) && sha(x.digest) && typeof x.boundary==='boolean' &&
    Object.keys(x).every(k=>['cube','gen','digest','boundary'].includes(k));
}

export function compileKmCrossing(a,b,options={}) {
  if (!options || Object.getPrototypeOf(options)!==Object.prototype ||
      Object.keys(options).some(k=>k!=='tolerance') || (options.tolerance!==undefined&&options.tolerance!==0))
    return reject('KM13_TOLERANCE_WIDENED');
  if (a==null||b==null) return computed('KM13_CROSSING',{predicate:'NO_EFFECT_WAITING',matched:false});
  if (!evidence(a)||!evidence(b)) return reject('KM13_EVIDENCE_INVALID');
  const predicate=crossing(a,b,{tolerance:0});
  return computed('KM13_CROSSING',{predicate,matched:predicate==='CROSSING_EVENT'},{
    authenticated_event:false,independent_readback_verified:false,
  });
}

export function compileKmLineage(template,coord,gen) {
  if(!id(template) || !isSafe(gen) || !coord || Object.getPrototypeOf(coord)!==Object.prototype ||
     Object.keys(coord).length>32 || Object.values(coord).some(x=>!id(x))) return reject('KM10_IDENTITY_INVALID');
  return computed('KM10_LINEAGE',{
    lineage_ref:lineageId(template,coord),
    instance_ref:instanceId(template,coord,gen),
    generation:gen,
  });
}

export function compileKmSeamIdentity(a,b) {
  if(!a||!b||!id(a.cell)||!id(b.cell)||!isSafe(a.gen)||!isSafe(b.gen)||
     Object.keys(a).some(k=>!['cell','gen'].includes(k))||
     Object.keys(b).some(k=>!['cell','gen'].includes(k)))
    return reject('KM12_IDENTITY_INVALID');
  return computed('KM12_SEAM_ID',{digest:seamId(a,b)});
}

export function compileKmStack(children) {
  if(!Array.isArray(children)||children.length<1||children.length>64||
     children.some(c=>!c||!id(c.id)||!isSafe(c.gen)||!isSafe(c.scale)||c.scale>1_000_000||
       !['PASS','RED','WAIT'].includes(c.state)||typeof c.evidence!=='string'||!id(c.evidence)) ||
     new Set(children.map(c=>`${c.id}@${c.gen}`)).size!==children.length)
    return reject('KM15_KM16_CHILDREN_INVALID');
  const donor=stack(children);
  // A consumer's submitted 'PASS' plus receipt-looking string is NOT an authenticated return.
  return computed('KM15_KM16_STACK',{
    ...donor,reported_pass:donor.state==='PASS',verified_pass:false,
    verification_state:'SUPPLIED_UNVERIFIED',
  },{authenticated_event:false,independent_readback_verified:false});
}

export function compileKmObserver(position,offsets) {
  if(!isSafe(position)||position>9||!Array.isArray(offsets)||offsets.length>128||
     offsets.some(x=>typeof x!=='number'||!Number.isSafeInteger(x)||Math.abs(x)>1_000_000))
    return reject('KM18_KM20_INPUT_INVALID');
  const net=offsets.reduce((a,b)=>a+BigInt(b),0n);
  const observerOffset=Number((net%10n+10n)%10n);
  const relative=relativePosition(position,observerOffset);
  return computed('KM18_KM20_OBSERVER',{
    relative_position:relative,doubled_position:doubling(position),closed_loop:closesLoop(offsets),
  });
}

export const KERNEL_MATHS_CUSTODY = Object.freeze({
  source:'base44/shared/kernelMaths.mjs',
  github_recovered_blob_sha1:'8a02e5575699eea24910c99a1e46de162de462a4',
  source_verified_as_original_sdk_commit:false,
  independent_python_oracle_recovered:false,
  original_source_exposed_as_authority:false,
  crossing_tolerance:0,provider_effect:false,authority_granted:false,
});
