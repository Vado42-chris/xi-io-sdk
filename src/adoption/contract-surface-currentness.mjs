import crypto from 'node:crypto';

const SHA256=/^[a-f0-9]{64}$/i;
const SHA40=/^[a-f0-9]{40}$/i;

function text(value,label){if(typeof value!=='string'||!value.trim())throw new TypeError(`${label}_REQUIRED`);return value.trim();}
function generation(value,label){const v=text(value,label);if(!SHA40.test(v))throw new TypeError(`${label}_INVALID`);return v.toLowerCase();}
function digest(value,label){const v=text(value,label);const bare=v.startsWith('sha256:')?v.slice(7):v;if(!SHA256.test(bare))throw new TypeError(`${label}_INVALID`);return `sha256:${bare.toLowerCase()}`;}
function pathValue(value){const v=text(value,'PATH');if(v.startsWith('/')||v.includes('..')||v.includes('\\')||v.length>512)throw new TypeError('PATH_INVALID');return v;}
function indexSurface(rows,label){if(!Array.isArray(rows)||rows.length===0)throw new TypeError(`${label}_REQUIRED`);const out=new Map();for(const row of rows){const path=pathValue(row?.path);if(out.has(path))throw new TypeError(`${label}_DUPLICATE_PATH`);out.set(path,{path,digest:digest(row?.digest,`${label}_DIGEST`)});}return out;}
function canonical(rows){return [...rows.values()].sort((a,b)=>a.path.localeCompare(b.path));}
function surfaceDigest(rows){return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex')}`;}

export function compileContractSurfaceCurrentness({consumer_ref,baseline,observed}){
 const consumer=text(consumer_ref,'CONSUMER_REF');
 if(!baseline||typeof baseline!=='object'||!observed||typeof observed!=='object')throw new TypeError('BASELINE_AND_OBSERVED_REQUIRED');
 const expectedProvider=text(baseline.provider_ref,'BASELINE_PROVIDER_REF');
 const observedProvider=text(observed.provider_ref,'OBSERVED_PROVIDER_REF');
 const baselineGeneration=generation(baseline.provider_generation,'BASELINE_PROVIDER_GENERATION');
 const observedGeneration=generation(observed.provider_generation,'OBSERVED_PROVIDER_GENERATION');
 const expected=indexSurface(baseline.surfaces,'BASELINE_SURFACES');
 const current=indexSurface(observed.surfaces,'OBSERVED_SURFACES');
 const expectedRows=canonical(expected),currentRows=canonical(current);
 const missing=expectedRows.filter(row=>!current.has(row.path)).map(row=>row.path);
 const changed=expectedRows.filter(row=>current.has(row.path)&&current.get(row.path).digest!==row.digest).map(row=>({path:row.path,baseline_digest:row.digest,observed_digest:current.get(row.path).digest}));
 const unexpected=currentRows.filter(row=>!expected.has(row.path)).map(row=>row.path);
 const providerMismatch=expectedProvider!==observedProvider;
 const unknown=providerMismatch||missing.length>0;
 const state=unknown?'UNKNOWN':changed.length?'AFFECTED':'NO_EFFECT_SUPPLIED';
 return {
  schema:'xiio.sdk.contract-surface-currentness/v1',
  consumer_ref:consumer,
  provider_ref:providerMismatch?null:expectedProvider,
  baseline_provider_ref:expectedProvider,
  observed_provider_ref:observedProvider,
  baseline_provider_generation:baselineGeneration,
  observed_provider_generation:observedGeneration,
  provider_generation_moved:baselineGeneration!==observedGeneration,
  baseline_surface_digest:surfaceDigest(expected),
  observed_required_surface_digest:`sha256:${crypto.createHash('sha256').update(JSON.stringify(expectedRows.filter(row=>current.has(row.path)).map(row=>({path:row.path,digest:current.get(row.path).digest})))).digest('hex')}`,
  state,
  supplied_coverage_complete:!missing.length&&!providerMismatch,
  surface_changed:unknown?null:changed.length>0,
  changed,
  missing,
  unexpected,
  verified:false,
  source_currentness:'UNVERIFIED',
  affected_consumer:state==='AFFECTED',
  no_effect_consumer:state==='NO_EFFECT_SUPPLIED',
  rebind_required:state!=='NO_EFFECT_SUPPLIED',
  whole_repository_replay_required:false,
  authority_granted:false,
  hard:[
   'SDK_MAIN_MOVED!=EVERY_CHILD_CONTRACT_STALE',
   'WHOLE_REPO_SHA!=CONSUMED_CONTRACT_SURFACE',
   'SUPPLIED_SURFACE_MATCH!=PROVIDER_VERIFIED_CURRENTNESS',
   'MISSING_REQUIRED_CONTRACT!=NO_EFFECT',
   'UNRELATED_SURFACE_MOVE!=AFFECTED_CONSUMER',
   'CONTRACT_SURFACE_NO_EFFECT!=RUNTIME_CURRENT',
  ],
 };
}
