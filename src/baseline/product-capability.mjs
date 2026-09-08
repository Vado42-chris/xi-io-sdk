import crypto from 'node:crypto';

export const PRODUCT_BASELINE_SCHEMA = 'xiio.sdk.product-capability-baseline/v1';
export const PRODUCT_BASELINE_CELLS = Object.freeze([
  'REGISTRATION',
  'PRODUCT_CLASSIFICATION',
  'REPO_BINDING',
  'DOMAIN_OWNER',
  'IA_RECIPE',
  'SDK_PRIMITIVE_CENSUS',
  'BRAND_PROFILE',
  'PERSONA_PROFILE',
  'API_CONTRACT',
  'SIMULATION_PROFILE',
  'ACK_PROFILE',
  'RETURN_READBACK',
]);
const STATES = new Set(['PASS','PARTIAL','BLOCKED','UNKNOWN','N_A_WITH_EVIDENCE']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return `sha256:${crypto.createHash('sha256').update(canonical(value)).digest('hex')}`; }
function text(value, field) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} required`); return value.trim(); }
function normalizeObservation(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { state:'UNKNOWN', proof_ref:null, blocker:'OBSERVATION_NOT_SUPPLIED' };
  const declared = STATES.has(value.state) ? value.state : 'UNKNOWN';
  const proof = typeof value.proof_ref === 'string' && value.proof_ref.trim() ? value.proof_ref.trim() : null;
  if (['PASS','N_A_WITH_EVIDENCE'].includes(declared) && !proof) return { state:'UNKNOWN', proof_ref:null, blocker:'POSITIVE_STATE_WITHOUT_PROOF' };
  return { state:declared, proof_ref:proof, blocker:value.blocker || null };
}

export function compileProductCapabilityBaseline(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.products) || !input.products.length) throw new TypeError('products required');
  const seen = new Set();
  const products = input.products.map((product) => {
    const productRef = text(product.product_ref, 'product_ref');
    if (seen.has(productRef)) throw new TypeError(`duplicate product_ref ${productRef}`);
    seen.add(productRef);
    const observations = product.observations || {};
    const cells = PRODUCT_BASELINE_CELLS.map((id) => ({ id, ...normalizeObservation(observations[id]) }));
    const firstOpen = cells.find(c => !['PASS','N_A_WITH_EVIDENCE'].includes(c.state)) || null;
    return {
      product_ref: productRef,
      project_ref: product.project_ref || null,
      product_class: product.product_class || 'UNKNOWN',
      repo_refs: Array.isArray(product.repo_refs) ? [...new Set(product.repo_refs)].sort() : [],
      capability_family_refs: Array.isArray(product.capability_family_refs) ? [...new Set(product.capability_family_refs)].sort() : [],
      cells,
      denominator: cells.length,
      resolved: cells.filter(c => ['PASS','N_A_WITH_EVIDENCE'].includes(c.state)).length,
      closure_100: cells.every(c => ['PASS','N_A_WITH_EVIDENCE'].includes(c.state)),
      next: firstOpen ? { cell:firstOpen.id, state:firstOpen.state, blocker:firstOpen.blocker } : null,
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
    resolved_cells: products.reduce((n,p)=>n+p.resolved,0),
    products_100: products.filter(p=>p.closure_100).length,
    products_not_100: products.filter(p=>!p.closure_100).length,
    org_product_100: products.every(p=>p.closure_100),
    products,
    hard: [
      'REPOSITORY != PROJECT != PRODUCT != CAPABILITY_FAMILY',
      'COMMENT_STEW != PRODUCT_REGISTRATION',
      'PRODUCT_REGISTERED != REPO_BASELINED',
      'IA_RECIPE_PRESENT != IA_RECIPE_CURRENT',
      'SIMULATION_EXISTS != SIMULATION_STANDARDIZED',
      'API_ROUTE_EXISTS != ACK_ONBOARDING_READY',
      'POSITIVE_STATE_WITHOUT_PROOF != PASS',
      'UNKNOWN != NO_EFFECT',
    ],
  };
  return { ...payload, product_baseline_generation: digest(payload) };
}
