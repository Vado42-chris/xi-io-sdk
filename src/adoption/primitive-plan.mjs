function ids(list, label) {
  if (!Array.isArray(list)) throw new TypeError(`${label} must be an array`);
  return [...new Set(list.map((value) => String(value ?? '').trim()).filter(Boolean))];
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

export function derivePrimitiveAdoptionPlan({ catalog, requiredPrimitiveIds, observedPrimitiveIds }) {
  const byId = indexCatalog(catalog);
  const required = ids(requiredPrimitiveIds, 'requiredPrimitiveIds');
  const observed = new Set(ids(observedPrimitiveIds, 'observedPrimitiveIds'));
  const unknown = required.filter((id) => !byId.has(id));
  const missing = required.filter((id) => byId.has(id) && !observed.has(id));
  const present = required.filter((id) => byId.has(id) && observed.has(id));
  return {
    schema: 'xiio.sdk.primitive-adoption-plan/v1',
    state: unknown.length ? 'UNKNOWN_REQUIRED' : missing.length ? 'MISSING_REQUIRED' : 'CURRENT',
    required_count: required.length,
    present_count: present.length,
    missing_count: missing.length,
    unknown_count: unknown.length,
    present,
    missing: missing.map((id) => publicDescriptor(byId.get(id))),
    unknown,
  };
}

export function deriveAffectedPrimitiveConsumers({ catalog, consumers }) {
  if (!Array.isArray(consumers)) throw new TypeError('consumers must be an array');
  const seen = new Set();
  const rows = consumers.map((consumer) => {
    const id = String(consumer?.consumer_id ?? '').trim();
    if (!id) throw new TypeError('consumer_id is required');
    if (seen.has(id)) throw new TypeError(`duplicate consumer_id ${id}`);
    seen.add(id);
    const plan = derivePrimitiveAdoptionPlan({
      catalog,
      requiredPrimitiveIds: consumer.required_primitive_ids,
      observedPrimitiveIds: consumer.observed_primitive_ids,
    });
    return {
      consumer_id: id,
      consumer_ref: consumer.consumer_ref ?? null,
      recipe_generation: consumer.recipe_generation ?? 'UNKNOWN',
      state: plan.state === 'CURRENT' ? 'NO_EFFECT' : plan.state === 'MISSING_REQUIRED' ? 'AFFECTED' : 'UNKNOWN',
      plan,
    };
  });
  return {
    schema: 'xiio.sdk.primitive-consumer-impact/v1',
    denominator: rows.length,
    affected: rows.filter((row) => row.state === 'AFFECTED'),
    no_effect: rows.filter((row) => row.state === 'NO_EFFECT'),
    unknown: rows.filter((row) => row.state === 'UNKNOWN'),
    rows,
  };
}
