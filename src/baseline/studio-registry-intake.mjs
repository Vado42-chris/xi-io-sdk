// SDK read-only projection of Studio's owner-maintained registry artifacts.
// Caller supplies the current artifacts through an approved configured route.
// This module never invents a product roster, fetches an unapproved URL, or
// treats a caller-supplied source pointer as authenticated currentness.
export const STUDIO_REGISTRY_INTAKE_SCHEMA = 'xiio.sdk.studio-registry-intake/v1';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const items = (value) => Array.isArray(value) ? value : [];
const safeText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const unique = (values) => [...new Set(values)];
const ids = (values, field) => {
  if (!Array.isArray(values) || values.some(value => !safeText(value))) {
    throw new TypeError(field + '_INVALID');
  }
  if (new Set(values).size !== values.length) throw new TypeError(field + '_DUPLICATE');
  return values;
};

export function compileStudioRegistryIntake(input = {}) {
  const denominator = input?.denominator;
  const graph = input?.relationship_graph ?? input?.graph;
  const source = Object.freeze({
    denominator_ref: safeText(input?.denominator_source_ref),
    graph_ref: safeText(input?.graph_source_ref),
    // Source references are pointers, not a verified admission or readback.
    currentness: safeText(input?.denominator_source_ref) && safeText(input?.graph_source_ref)
      ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
  });
  const empty = {
    schema: STUDIO_REGISTRY_INTAKE_SCHEMA,
    owner: 'STUDIO',
    source,
    state: 'WAIT_REGISTRY_UNBOUND',
    denominator_generation: null,
    relationship_generation: null,
    member_count: null,
    member_ids: [],
    members: [],
    unknown_membership_ids: [],
    unresolved_relationship_ids: [],
    missing_graph_member_ids: [],
    relationship_complete: false,
    counted_from_canonical_registry: false,
    registry_count_consistent: false,
    full_affected_set_closed: false,
    authority_granted: false,
    provider_effect: false,
    blockers: ['STUDIO_DENOMINATOR_UNBOUND'],
    hard: [
      'SUPPLIED_SOURCE_REF != AUTHENTICATED_CURRENTNESS',
      'PRODUCT_DENOMINATOR != REPOSITORY_INVENTORY',
      'PARTIAL_GRAPH != FULL_AFFECTED_SET',
      'UNKNOWN_MEMBERSHIP != NO_EFFECT',
    ],
  };
  if (!object(denominator)) return empty;
  if (denominator.schema !== 'xiio.studio-product-denominator/v1') {
    throw new TypeError('STUDIO_DENOMINATOR_SCHEMA_INVALID');
  }
  if (!object(denominator.categories)) throw new TypeError('STUDIO_DENOMINATOR_CATEGORIES_INVALID');
  const member_ids = ids(denominator.categories.studio_member_known, 'STUDIO_MEMBERS');
  const unknown_membership_ids = ids(
    denominator.categories.studio_membership_unknown_drift ?? [], 'STUDIO_UNKNOWN_MEMBERSHIP',
  );
  const bindings = object(denominator.repository_bindings) ? denominator.repository_bindings : {};
  const unresolvedBindings = object(denominator.no_repo_or_unresolved_bindings)
    ? denominator.no_repo_or_unresolved_bindings : {};
  const members = member_ids.map(product_id => ({
    product_id,
    repository_ref: safeText(bindings[product_id]),
    binding_state: hasOwn(bindings, product_id) ? 'DECLARED_UNVERIFIED'
      : safeText(unresolvedBindings[product_id]) || 'UNRESOLVED',
  }));
  const blockers = [];
  const registry_count_consistent = denominator.counts?.studio_member_known === member_ids.length &&
    denominator.counts?.studio_membership_denominator === member_ids.length;
  if (!registry_count_consistent) {
    blockers.push('STUDIO_DENOMINATOR_COUNT_DRIFT');
  }
  if (!safeText(denominator.generation)) blockers.push('STUDIO_DENOMINATOR_GENERATION_UNBOUND');
  if (!source.denominator_ref) blockers.push('STUDIO_DENOMINATOR_SOURCE_REF_UNBOUND');
  if (unknown_membership_ids.length) blockers.push('STUDIO_MEMBERSHIP_UNKNOWN_DRIFT');
  if (!object(graph)) {
    blockers.push('STUDIO_RELATIONSHIP_GRAPH_UNBOUND');
    return {
      ...empty, source, state: 'WAIT_GRAPH_UNBOUND',
      denominator_generation: safeText(denominator.generation), member_count: member_ids.length,
      member_ids, members, unknown_membership_ids,
      counted_from_canonical_registry: true, registry_count_consistent, blockers,
    };
  }
  if (graph.schema !== 'xiio.studio-relationship-graph/v1') {
    throw new TypeError('STUDIO_RELATIONSHIP_GRAPH_SCHEMA_INVALID');
  }
  if (graph.root_ref !== denominator.id) blockers.push('STUDIO_GRAPH_DENOMINATOR_ID_MISMATCH');
  if (!source.graph_ref) blockers.push('STUDIO_GRAPH_SOURCE_REF_UNBOUND');
  if (!safeText(graph.generation)) blockers.push('STUDIO_GRAPH_GENERATION_UNBOUND');
  const nodes = items(graph.product_nodes);
  const nodeIds = nodes.map(node => safeText(node?.id)).filter(Boolean);
  const missing_graph_member_ids = member_ids.filter(id => !nodeIds.includes(id) ||
    !nodes.some(node => node?.id === id && node?.membership === 'MEMBER'));
  if (new Set(nodeIds).size !== nodeIds.length) blockers.push('STUDIO_GRAPH_DUPLICATE_PRODUCT_NODE');
  if (missing_graph_member_ids.length) blockers.push('STUDIO_GRAPH_MEMBER_COVERAGE_INCOMPLETE');
  const unresolved_relationship_ids = items(graph.unresolved_candidate_nodes)
    .map(node => safeText(node?.id)).filter(Boolean);
  if (unresolved_relationship_ids.length) blockers.push('STUDIO_GRAPH_UNRESOLVED_CANDIDATES');
  if (graph.complete !== true) blockers.push('STUDIO_RELATIONSHIP_GRAPH_PARTIAL');
  const relationship_complete = graph.complete === true &&
    !missing_graph_member_ids.length && !unresolved_relationship_ids.length &&
    !blockers.includes('STUDIO_GRAPH_DENOMINATOR_ID_MISMATCH') &&
    !blockers.includes('STUDIO_GRAPH_DUPLICATE_PRODUCT_NODE');
  const state = blockers.includes('STUDIO_GRAPH_DENOMINATOR_ID_MISMATCH')
    ? 'BLOCKED_SOURCE_MISMATCH' : relationship_complete
      ? 'SUPPLIED_UNVERIFIED' : 'PARTIAL_GRAPH';
  return {
    ...empty, source, state,
    denominator_generation: safeText(denominator.generation),
    relationship_generation: safeText(graph.generation),
    member_count: member_ids.length, member_ids, members, unknown_membership_ids,
    unresolved_relationship_ids, missing_graph_member_ids, relationship_complete,
    counted_from_canonical_registry: true, registry_count_consistent,
    // Even a source-declared complete graph is not a Ward or provider receipt.
    full_affected_set_closed: false,
    blockers,
  };
}
