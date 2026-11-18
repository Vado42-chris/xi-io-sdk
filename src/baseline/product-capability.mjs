import crypto from 'node:crypto';
import fs from 'node:fs';
import { bindHexFloorCurrentness } from '../currentness/hex-floor.mjs';

export const PRODUCT_BASELINE_SCHEMA = 'xiio.sdk.product-capability-baseline/v1';
export const PRODUCT_BASELINE_CONTRACT=Object.freeze(JSON.parse(
  fs.readFileSync(new URL('./product-capability-contract.v1.json',import.meta.url),'utf8')
));
if(PRODUCT_BASELINE_CONTRACT?.schema!=='xiio.sdk.product-capability-baseline-contract/v1'||
   PRODUCT_BASELINE_CONTRACT?.version!==1)
  throw new TypeError('PRODUCT_BASELINE_CONTRACT_INVALID');
const exactUnique=(values,code)=>{
  if(!Array.isArray(values)||values.length===0||values.some(v=>typeof v!=='string'||!v.trim())||
     new Set(values).size!==values.length)throw new TypeError(code);
  return Object.freeze([...values]);
};
export const PRODUCT_BASELINE_CELLS=exactUnique(PRODUCT_BASELINE_CONTRACT.cells,'PRODUCT_BASELINE_CELL_DENOMINATOR_INVALID');
export const PRODUCT_BASELINE_INPUT_STATES=exactUnique(PRODUCT_BASELINE_CONTRACT.observation_states,'PRODUCT_BASELINE_STATE_DENOMINATOR_INVALID');
export const PRODUCT_BASELINE_POSITIVE_STATES=exactUnique(PRODUCT_BASELINE_CONTRACT.positive_states,'PRODUCT_BASELINE_POSITIVE_DENOMINATOR_INVALID');
const INPUT_STATES = new Set(PRODUCT_BASELINE_INPUT_STATES);
const POSITIVE = new Set(PRODUCT_BASELINE_POSITIVE_STATES);
for(const state of POSITIVE)if(!INPUT_STATES.has(state))throw new TypeError('PRODUCT_BASELINE_POSITIVE_STATE_FOREIGN');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return `sha256:${crypto.createHash('sha256').update(canonical(value)).digest('hex')}`; }
function text(value, field) { if (typeof value !== 'string' || !value.trim() || value.length > 512) throw new TypeError(`${field} requires bounded text`); return value.trim(); }
function optionalText(value) { return typeof value === 'string' && value.trim() && value.length <= 512 ? value.trim() : null; }
function refs(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return [...new Set(value.map(item => text(item, field)))].sort();
}
function bound(value) { return value && !/^(UNKNOWN|UNBOUND|PENDING)$/i.test(value); }
function normalizeObservation(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { state:'UNKNOWN', declared_state:'UNKNOWN', verified:false, proof_ref:null, blocker:'OBSERVATION_NOT_SUPPLIED' };
  const declared = INPUT_STATES.has(value.state) ? value.state : 'UNKNOWN';
  const proof = optionalText(value.proof_ref);
  if (POSITIVE.has(declared) && !proof) return { state:'UNKNOWN', declared_state:'UNKNOWN', verified:false, proof_ref:null, blocker:'POSITIVE_STATE_WITHOUT_PROOF' };
  return {
    state: POSITIVE.has(declared) ? 'SUPPLIED_UNVERIFIED' : declared,
    declared_state: declared,
    verified:false,
    proof_ref:proof,
    blocker:optionalText(value.blocker),
  };
}

export function compileProductCapabilityBaseline(input) {
  const hexCurrentness = bindHexFloorCurrentness(input?.hex_floor);
  if (!input || typeof input !== 'object' || !Array.isArray(input.products) || !input.products.length) throw new TypeError('products required');
  const seen = new Set();
  const products = input.products.map((product) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) throw new TypeError('product must be an object');
    const productRef = text(product.product_ref, 'product_ref');
    if (seen.has(productRef)) throw new TypeError(`duplicate product_ref ${productRef}`);
    seen.add(productRef);
    const observations = product.observations || {};
    const cells = PRODUCT_BASELINE_CELLS.map((id) => ({ id, ...normalizeObservation(observations[id]) }));
    const firstDeclaredOpen = cells.find(c => !POSITIVE.has(c.declared_state)) || null;
    const suppliedResolved = cells.filter(c => POSITIVE.has(c.declared_state)).length;
    const productClass = optionalText(product.product_class) || 'UNKNOWN';
    const repoRefs = refs(product.repo_refs, 'repo_refs');
    return {
      product_ref: productRef,
      project_ref: optionalText(product.project_ref),
      product_class: productClass,
      repo_refs: repoRefs,
      capability_family_refs: refs(product.capability_family_refs, 'capability_family_refs'),
      classification_state: bound(productClass) ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
      repo_binding_state: repoRefs.length ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
      evidence_state:'SUPPLIED_UNVERIFIED',
      cells,
      denominator: cells.length,
      resolved:0,
      supplied_resolved:suppliedResolved,
      supplied_coverage_100:suppliedResolved===cells.length,
      closure_100:false,
      next:firstDeclaredOpen
        ? { cell:firstDeclaredOpen.id, state:firstDeclaredOpen.declared_state, blocker:firstDeclaredOpen.blocker }
        : { cell:'VERIFY_SUPPLIED_BASELINE', state:'SUPPLIED_UNVERIFIED', blocker:'AUTHENTICATED_PRODUCT_BASELINE_REQUIRED' },
    };
  }).sort((a,b)=>a.product_ref.localeCompare(b.product_ref));
  const cellDenominator = products.length * PRODUCT_BASELINE_CELLS.length;
  const payload = {
    schema: PRODUCT_BASELINE_SCHEMA,
    source_generation: text(input.source_generation, 'source_generation'),
    observed_at: text(input.observed_at, 'observed_at'),
    product_denominator: products.length,
    cells_per_product: PRODUCT_BASELINE_CELLS.length,
    cell_denominator: cellDenominator,
    verified_resolved_cells:0,
    supplied_resolved_cells:products.reduce((n,p)=>n+p.supplied_resolved,0),
    products_100:0,
    products_not_100:products.length,
    org_product_100:false,
    evidence_state:'SUPPLIED_UNVERIFIED',
    authority_granted:false,
    provider_effect:false,
    source_generation_state: bound(input.source_generation.trim()) ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
    source_currentness:hexCurrentness.state,
    hex_projection_ref:hexCurrentness.projection_ref,
    missing_punchcards:hexCurrentness.missing_punchcards,
    live_claim:false,
    products,
    hard: [
      'REPOSITORY != PROJECT != PRODUCT != CAPABILITY_FAMILY',
      'COMMENT_STEW != PRODUCT_REGISTRATION',
      'PRODUCT_REGISTERED != REPO_BASELINED',
      'IA_RECIPE_PRESENT != IA_RECIPE_CURRENT',
      'SIMULATION_EXISTS != SIMULATION_STANDARDIZED',
      'API_ROUTE_EXISTS != ACK_ONBOARDING_READY',
      'SUPPLIED_PROOF_REF != AUTHENTICATED_EVIDENCE',
      'SUPPLIED_COVERAGE != CLOSURE_100',
      'PRODUCT_WITHOUT_REPO != MISSING_PRODUCT',
      'UNKNOWN != NO_EFFECT',
    ],
  };
  return { ...payload, product_baseline_generation: digest(payload) };
}
