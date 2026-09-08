import crypto from 'node:crypto';

export const FOUR_SCALE_SCHEMA = 'xiio.sdk.four-scale-scorecard/v1';
export const FOUR_SCALE_LAYERS = Object.freeze(['MICRO','MESO','MACRO','META']);
export const FOUR_SCALE_STAGES = Object.freeze([
  'CHANGE_MATERIALIZED','EXACT_HEAD_PROOF','REVIEW_DISPOSITION','MERGED_TO_MAIN','MAIN_READBACK_CURRENT','AFFECTED_RETURN_CURRENT',
]);
const POSITIVE = new Set(['PASS','N_A_WITH_EVIDENCE']);
const STATES = new Set(['PASS','PARTIAL','BLOCKED','UNKNOWN','WAIT','N_A_WITH_EVIDENCE']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return `sha256:${crypto.createHash('sha256').update(canonical(value)).digest('hex')}`; }
function required(value, field) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} required`); return value.trim(); }
function normalize(value = {}) {
  const declared = STATES.has(value?.state) ? value.state : 'UNKNOWN';
  const proof_ref = typeof value?.proof_ref === 'string' && value.proof_ref.trim() ? value.proof_ref.trim() : null;
  if (POSITIVE.has(declared) && !proof_ref) return { state:'UNKNOWN', declared_state:'UNKNOWN', verified:false, proof_ref:null, blocker:'POSITIVE_STATE_WITHOUT_PROOF' };
  return {
    state:POSITIVE.has(declared)?'SUPPLIED_UNVERIFIED':declared,
    declared_state:declared,
    verified:false,
    proof_ref,
    blocker:value?.blocker || null,
  };
}

export function compileFourScaleScorecard(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input required');
  const observations = input.observations || {};
  const layers = FOUR_SCALE_LAYERS.map((layer) => {
    const cells = FOUR_SCALE_STAGES.map((stage) => ({ stage, ...normalize(observations?.[layer]?.[stage]) }));
    const suppliedResolved = cells.filter(c=>POSITIVE.has(c.declared_state)).length;
    const firstDeclaredOpen = cells.find(c=>!POSITIVE.has(c.declared_state)) || null;
    return {
      layer,
      denominator:FOUR_SCALE_STAGES.length,
      resolved:0,
      supplied_resolved:suppliedResolved,
      display:`0/${FOUR_SCALE_STAGES.length}`,
      supplied_display:`${suppliedResolved}/${FOUR_SCALE_STAGES.length}`,
      pct:0,
      supplied_pct:Number(((suppliedResolved/FOUR_SCALE_STAGES.length)*100).toFixed(2)),
      supplied_coverage_100:suppliedResolved===FOUR_SCALE_STAGES.length,
      closure_100:false,
      first_open:firstDeclaredOpen || { stage:'VERIFY_SUPPLIED_LAYER', state:'SUPPLIED_UNVERIFIED', blocker:'AUTHENTICATED_LAYER_EVIDENCE_REQUIRED' },
      cells,
    };
  });
  const payload = {
    schema:FOUR_SCALE_SCHEMA,
    subject_ref:required(input.subject_ref,'subject_ref'),
    subject_generation:required(input.subject_generation,'subject_generation'),
    evidence_state:'SUPPLIED_UNVERIFIED',
    authority_granted:false,
    provider_effect:false,
    layers,
    compound_display:layers.map(l=>`${l.layer}:${l.display}`).join(' | '),
    supplied_compound_display:layers.map(l=>`${l.layer}:${l.supplied_display}`).join(' | '),
    supplied_compound_100:layers.every(l=>l.supplied_coverage_100),
    compound_100:false,
    hard: [
      'MICRO_100 != MESO_100 != MACRO_100 != META_100',
      'HIGHER_LAYER_PASS != LOWER_LAYER_CLOSURE',
      'ACCOUNTING_100 != CLOSURE_100',
      'SUPPLIED_PROOF_REF != AUTHENTICATED_EVIDENCE',
      'SUPPLIED_100S != VERIFIED_100S',
      'CHECK_PASS != LIVE_PASS',
      'RESULT != RETURN != APPLY_RETURN',
      'PASS = NEXT_FROZEN_INPUT',
    ],
  };
  return { ...payload, scorecard_generation:digest(payload) };
}
