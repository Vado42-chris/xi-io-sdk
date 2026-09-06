const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveCallable(catalog, callableUuid) {
  if (!catalog || !Array.isArray(catalog.primitives)) throw new TypeError('catalog.primitives is required');
  const uuid = String(callableUuid ?? '').trim().toLowerCase();
  if (!UUID.test(uuid)) return null;
  return catalog.primitives.find(item => String(item.callable_uuid).toLowerCase() === uuid) ?? null;
}

export function callableUuidFor(catalog, primitiveId) {
  if (!catalog || !Array.isArray(catalog.primitives)) throw new TypeError('catalog.primitives is required');
  const id = String(primitiveId ?? '').trim();
  return catalog.primitives.find(item => item.id === id)?.callable_uuid ?? null;
}

export function listCallablePrimitives(catalog) {
  if (!catalog || !Array.isArray(catalog.primitives)) throw new TypeError('catalog.primitives is required');
  return catalog.primitives.map(({ id, callable_uuid, family, kind, export: exportName, maturity }) => ({
    id,
    callable_uuid,
    family,
    kind,
    export: exportName,
    maturity,
  }));
}
