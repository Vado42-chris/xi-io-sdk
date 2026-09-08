function ids(list, label) {
  if (!Array.isArray(list)) throw new TypeError(`${label} must be an array`);
  const seen = new Set();
  for (const value of list) {
    if (typeof value !== 'string' || !value.trim() || value.length > 256) {
      throw new TypeError(`${label} requires bounded nonblank string identities`);
    }
    if (seen.has(value.trim())) throw new TypeError(`${label} has duplicate identities`);
    seen.add(value.trim());
  }
  return [...seen];
}

function text(value) {
  return typeof value === 'string' && value.trim() && value.length <= 512 ? value.trim() : null;
}

function recipeBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source_ref = text(value.source_ref);
  const source_head = typeof value.source_head === 'string' && /^[a-f0-9]{40}$/i.test(value.source_head)
    ? value.source_head.toLowerCase() : null;
  const recipe_generation = text(value.recipe_generation);
  if (!source_ref || !source_head || !recipe_generation || /^(UNKNOWN|UNBOUND|PENDING)$/i.test(recipe_generation)) return null;
  return { source_ref, source_head, recipe_generation };
}

function deriveRecipeLineage(recipeBaseline, observedRecipe) {
  const expected = recipeBinding(recipeBaseline);
  const observed = recipeBinding(observedRecipe);
  const mismatches = expected && observed
    ? Object.keys(expected).filter((key) => expected[key] !== observed[key]) : [];
  return {
    state: !expected || !observed ? 'UNBOUND' : mismatches.length ? 'MISMATCH' : 'MATCH_SUPPLIED',
    expected,
    observed,
    mismatches,
    source_currentness: 'UNVERIFIED',
  };
}

function indexCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.primitives)) throw new TypeError('catalog.primitives is required');
  const map = new Map();
  for (const item of catalog.primitives) {
    if (!item?.id) throw new TypeError('catalog primitive id required');
    if (map.has(item.id)) throw new TypeError(`duplicate primitive id ${item.id}`);
    if (!item.callable_uuid || !item.specifier || !Array.isArray(item.styles)) {
      throw new TypeError(`${item.id}: callable_uuid, specifier and styles are required`);
    }
    map.set(item.id, item);
  }
  return map;
}

function publicDescriptor(item) {
  return {
    id: item.id,
    callable_uuid: item.callable_uuid,
    family: item.family,
    kind: item.kind,
    export: item.export,
    specifier: item.specifier,
    styles: [...item.styles],
    maturity: item.maturity,
  };
}

export function derivePrimitiveAdoptionPlan({ catalog, requiredPrimitiveIds, observedPrimitiveIds, recipeBaseline, observedRecipe }) {
  const byId = indexCatalog(catalog);
  const required = ids(requiredPrimitiveIds, 'requiredPrimitiveIds');
  const observed = new Set(ids(observedPrimitiveIds, 'observedPrimitiveIds'));
  const unknown = required.filter((id) => !byId.has(id));
  const missing = required.filter((id) => byId.has(id) && !observed.has(id));
  const present = required.filter((id) => byId.has(id) && observed.has(id));
  const lineage = deriveRecipeLineage(recipeBaseline, observedRecipe);
  // This reducer compares supplied declarations. It cannot authenticate source,
  // accepted-main adoption, or a consumer's running bindings.
  const state = unknown.length || !required.length ? 'UNKNOWN_REQUIRED'
    : missing.length ? 'MISSING_REQUIRED'
      : lineage.state === 'MISMATCH' ? 'STALE_RECIPE'
        : lineage.state === 'UNBOUND' ? 'UNKNOWN_LINEAGE' : 'PRESENT_UNVERIFIED';
  return {
    schema: 'xiio.sdk.primitive-adoption-plan/v1',
    state,
    required_count: required.length,
    present_count: present.length,
    missing_count: missing.length,
    unknown_count: unknown.length,
    present,
    missing: missing.map((id) => publicDescriptor(byId.get(id))),
    unknown,
    lineage,
    supplied_coverage_complete: required.length > 0 && !unknown.length && !missing.length,
    verified_count: 0,
    closure_100: false,
    live_claim: false,
  };
}

export function deriveAffectedPrimitiveConsumers({ catalog, consumers, expectedConsumerIds, consumerRosterRef, consumerRosterGeneration, recipeBaseline }) {
  if (!Array.isArray(consumers)) throw new TypeError('consumers must be an array');
  const expected = expectedConsumerIds === undefined ? null : ids(expectedConsumerIds, 'expectedConsumerIds');
  const expectedSet = new Set(expected || []);
  const rosterRef = text(consumerRosterRef);
  const rosterGeneration = text(consumerRosterGeneration);
  const denominatorBound = Boolean(expected?.length && rosterRef && rosterGeneration
    && !/^(UNKNOWN|UNBOUND|PENDING)$/i.test(rosterGeneration));
  const seen = new Set();
  const rows = consumers.map((consumer) => {
    const id = ids([consumer?.consumer_id], 'consumer_id')[0];
    if (seen.has(id)) throw new TypeError(`duplicate consumer_id ${id}`);
    seen.add(id);
    const plan = derivePrimitiveAdoptionPlan({
      catalog,
      requiredPrimitiveIds: consumer.required_primitive_ids,
      observedPrimitiveIds: consumer.observed_primitive_ids,
      recipeBaseline,
      observedRecipe: {
        source_ref: consumer.recipe_source_ref,
        source_head: consumer.recipe_source_head,
        recipe_generation: consumer.recipe_generation,
      },
    });
    const declared = expectedSet.has(id);
    const state = (expected && !declared) ? 'UNKNOWN'
      : ['MISSING_REQUIRED', 'STALE_RECIPE'].includes(plan.state) ? 'AFFECTED'
        : plan.state === 'PRESENT_UNVERIFIED' && denominatorBound ? 'UNVERIFIED' : 'UNKNOWN';
    return {
      consumer_id: id,
      consumer_ref: consumer.consumer_ref ?? null,
      recipe_generation: consumer.recipe_generation ?? 'UNKNOWN',
      state,
      reason: expected && !declared ? 'UNDECLARED_CONSUMER'
        : !denominatorBound ? 'UNBOUND_CONSUMER_DENOMINATOR' : plan.state,
      plan,
    };
  });
  const missing = (expected || []).filter((id) => !seen.has(id));
  for (const id of missing) {
    rows.push({ consumer_id: id, consumer_ref: null, recipe_generation: 'UNKNOWN',
      state: 'UNKNOWN', reason: 'MISSING_CONSUMER', plan: null });
  }
  const unexpected = expected ? [...seen].filter((id) => !expectedSet.has(id)) : [];
  return {
    schema: 'xiio.sdk.primitive-consumer-impact/v1',
    denominator: rows.length,
    expected_count: expected?.length ?? null,
    observed_count: consumers.length,
    denominator_state: denominatorBound ? 'SUPPLIED_EXPECTATION' : 'UNBOUND',
    consumer_roster_ref: rosterRef,
    consumer_roster_generation: rosterGeneration,
    roster_currentness: 'UNVERIFIED',
    missing_consumers: missing,
    undeclared_consumers: unexpected,
    supplied_denominator_coverage_complete: denominatorBound && !missing.length && !unexpected.length,
    affected: rows.filter((row) => row.state === 'AFFECTED'),
    no_effect: [],
    unverified: rows.filter((row) => row.state === 'UNVERIFIED'),
    unknown: rows.filter((row) => row.state === 'UNKNOWN'),
    verified_count: 0,
    closure_100: false,
    live_claim: false,
    hard: ['ID_PRESENCE != CURRENT_RECIPE', 'SUPPLIED_LINEAGE != SOURCE_CURRENTNESS',
      'SUPPLIED_CONSUMERS != ACCOUNT_DENOMINATOR', 'UNKNOWN != NO_EFFECT',
      'DECLARED_COVERAGE != ACCEPTED_ADOPTION'],
    rows,
  };
}
