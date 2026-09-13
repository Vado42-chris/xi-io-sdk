import { compileStudioRoster } from '../install/studio-headless-topology.mjs';
import { compileImpactFormation } from './impact-formation.mjs';

export const STUDIO_IMPACT_ASSURANCE_SCHEMA = 'xiio.sdk.studio-impact-assurance/v1';
const EVIDENCE_NAMES = Object.freeze(['data_forge', 'dotproject', 'bugzilla']);

const text = (value) => String(value ?? '').trim();
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function aliasMap(rows) {
  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const alias = text(row?.alias).toLowerCase();
    const canonical = text(row?.canonical).toLowerCase();
    const evidenceRef = text(row?.evidence_ref);
    if (alias && canonical && evidenceRef) out.set(alias, { canonical, evidence_ref: evidenceRef });
  }
  return out;
}

function nodeMap(impact) {
  return new Map((impact?.nodes || []).map((node) => [text(node?.ref), node]));
}

function productMap(rosterInput) {
  return new Map((rosterInput?.products || []).map((product) => [text(product?.product_id).toLowerCase(), product]));
}

function first(blockers, fallback = 'NO_STRUCTURAL_BLOCKER') {
  return blockers[0]?.code || fallback;
}

function normalizeEvidenceObservation(value) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const native_readback_ref = text(row.native_readback_ref) || null;
  const observation_receipt_ref = text(row.observation_receipt_ref) || null;
  const observed_generation = text(row.observed_generation) || null;
  const currentness = text(row.currentness).toUpperCase() || 'UNKNOWN';
  const trust_class = text(row.trust_class).toUpperCase() || 'CALLER_SUPPLIED';
  const structurally_complete = Boolean(native_readback_ref && observation_receipt_ref && observed_generation && currentness === 'CURRENT');
  return {
    native_readback_ref,
    observation_receipt_ref,
    observed_generation,
    currentness,
    trust_class,
    structurally_complete,
    authenticated_here: false,
  };
}

export function compileStudioImpactAssurance(input = {}) {
  if (!input || input.schema !== STUDIO_IMPACT_ASSURANCE_SCHEMA) throw new TypeError('studio impact assurance schema invalid');
  if (!input.roster || !input.impact) throw new TypeError('roster and impact inputs required');

  const roster = compileStudioRoster(input.roster);
  const formation = compileImpactFormation(input.impact);
  const blockers = [];
  const sourceProducts = productMap(input.roster);
  const impactNodes = nodeMap(input.impact);
  const aliases = aliasMap(input.identity_aliases);
  const external = new Set((input.roster.external_dependencies || []).map((value) => text(value).toLowerCase()));
  const productNodeRefs = input.product_node_refs && typeof input.product_node_refs === 'object'
    ? input.product_node_refs
    : {};

  if (!roster.registry_complete) blockers.push({ code: 'STUDIO_ROSTER_REGISTRY_PROOF_UNPROVEN' });

  const missingDependencyDeclarations = [...sourceProducts.entries()]
    .filter(([, product]) => !own(product, 'dependencies'))
    .map(([product_id]) => product_id);
  if (missingDependencyDeclarations.length) {
    blockers.push({ code: 'STUDIO_PRODUCT_DEPENDENCY_DECLARATIONS_MISSING', product_ids: missingDependencyDeclarations });
  }
  if (!roster.dependency_closure) blockers.push({ code: 'STUDIO_ROSTER_DEPENDENCY_CLOSURE_FAILED' });

  const observations = input.evidence_observations && typeof input.evidence_observations === 'object'
    ? input.evidence_observations
    : {};
  const evidence = roster.evidence_stack.map((row) => {
    const observation = normalizeEvidenceObservation(observations[row.name]);
    return {
      ...row,
      observation,
      structurally_admissible: row.state === 'SUPPLIED_UNVERIFIED' && observation.structurally_complete,
      reliable: false,
    };
  });
  const unprovenEvidence = evidence.filter((row) => !row.structurally_admissible).map((row) => row.name);
  if (unprovenEvidence.length) {
    blockers.push({ code: 'BINS_EVIDENCE_TRINITY_UNPROVEN', required: EVIDENCE_NAMES, unproven: unprovenEvidence });
  }

  if (sourceProducts.has('devforge') && sourceProducts.has('dataforge')) {
    const alias = aliases.get('dataforge');
    if (!alias || alias.canonical !== 'devforge') {
      blockers.push({ code: 'DEVFORGE_DATAFORGE_IDENTITY_COLLISION', required_alias: 'dataforge->devforge' });
    }
  }

  const mapping = {};
  for (const product_id of sourceProducts.keys()) {
    const mapped = text(productNodeRefs[product_id]);
    mapping[product_id] = mapped || null;
    if (!mapped) {
      blockers.push({ code: 'STUDIO_PRODUCT_IMPACT_NODE_UNBOUND', product_id });
      continue;
    }
    if (!impactNodes.has(mapped)) blockers.push({ code: 'STUDIO_PRODUCT_IMPACT_NODE_MISSING', product_id, node_ref: mapped });
  }

  for (const [product_id, product] of sourceProducts.entries()) {
    if (!own(product, 'dependencies')) continue;
    const fromRef = mapping[product_id];
    const impactNode = fromRef ? impactNodes.get(fromRef) : null;
    if (!impactNode) continue;
    const represented = new Set((impactNode.dependencies || []).map(text));
    for (const rawDependency of product.dependencies || []) {
      const dependency = text(rawDependency).toLowerCase();
      if (!dependency || external.has(dependency)) continue;
      const dependencyRef = mapping[dependency];
      if (!dependencyRef || !represented.has(dependencyRef)) {
        blockers.push({
          code: 'STUDIO_IMPACT_DEPENDENCY_EDGE_MISSING',
          product_id,
          dependency,
          expected_node_ref: dependencyRef || null,
        });
      }
    }
  }

  const uniqueCodes = [...new Set(blockers.map((row) => row.code))];
  const structuralComplete = blockers.length === 0;
  return Object.freeze(JSON.parse(JSON.stringify({
    schema: 'xiio.sdk.studio-impact-assurance-projection/v1',
    structural_complete: structuralComplete,
    reliable: false,
    proof_state: structuralComplete ? 'STRUCTURALLY_COMPLETE_NATIVE_VERIFICATION_REQUIRED' : 'UNRELIABLE_BLOCKED',
    first_red: first(blockers, structuralComplete ? 'NATIVE_VERIFICATION_REQUIRED' : 'NO_STRUCTURAL_BLOCKER'),
    verification_required: structuralComplete ? ['BINS_PROVIDER_NATIVE_READBACK_VERIFIER'] : [],
    roster: {
      registry_complete: roster.registry_complete,
      evidence_complete: roster.evidence_complete,
      dependency_closure: roster.dependency_closure,
      product_count: roster.product_count,
      blockers: roster.blockers,
    },
    evidence_trinity: evidence,
    impact: {
      node_denominator: formation.node_denominator,
      affected_nodes: formation.affected_nodes,
      unknown_nodes: formation.unknown_nodes,
      detonation_denominator: formation.detonation_denominator,
      product_node_refs: mapping,
    },
    blockers,
    blocker_codes: uniqueCodes,
    effects: 0,
    authority_granted: false,
    hard: [
      'STUDIO_WORK -> STUDIO_ROSTER -> PRODUCT_DEPENDENCIES -> IMPACT_FORMATION',
      'BURNDOWN_IMPACT_WITHOUT_STUDIO_ROSTER = UNRELIABLE',
      'IMPACT_REPORT_WITHOUT_DATA_FORGE_DOTPROJECT_BUGZILLA = UNRELIABLE',
      'CALLER_ASSERTED_NATIVE_READBACK != TRUSTED_NATIVE_READBACK',
      'STRUCTURAL_ASSURANCE != RELIABLE_EVIDENCE',
      'BUGZILLA_REF != BUGZILLA_NATIVE_READBACK',
      'DOTPROJECT_LINK != DOTPROJECT_NATIVE_READBACK',
      'DATA_FORGE_CONTEXT != DATA_FORGE_NATIVE_READBACK',
      'DATAFORGE_LINEAGE != SECOND_PRODUCT_WITHOUT_IDENTITY_PROOF',
      'EMPTY_DEPENDENCIES != NO_DEPENDENCIES_UNLESS_DECLARED',
      'IMPACT_NODE_PRESENT != DEPENDENCY_EDGE_PRESENT',
      'ASSURANCE_COMPLETE != EFFECT_AUTHORITY',
    ],
  })));
}
