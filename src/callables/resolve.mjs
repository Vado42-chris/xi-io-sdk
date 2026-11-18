const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function catalogPrimitives(catalog) {
  if (!catalog || !Array.isArray(catalog.primitives)) throw new TypeError('catalog.primitives is required');
  const ids = new Set();
  const uuids = new Set();
  for (let index = 0; index < catalog.primitives.length; index += 1) {
    const item = catalog.primitives[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`CALLABLE_CATALOG_PRIMITIVE_INVALID:${index}`);
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) throw new TypeError(`CALLABLE_CATALOG_ID_REQUIRED:${index}`);
    if (ids.has(id)) throw new TypeError(`CALLABLE_CATALOG_ID_DUPLICATE:${id}`);
    ids.add(id);

    const uuid = typeof item.callable_uuid === 'string' ? item.callable_uuid.trim().toLowerCase() : '';
    if (!UUID.test(uuid)) throw new TypeError(`CALLABLE_CATALOG_UUID_INVALID:${id}`);
    if (uuids.has(uuid)) throw new TypeError(`CALLABLE_CATALOG_UUID_DUPLICATE:${uuid}`);
    uuids.add(uuid);
  }
  return catalog.primitives;
}

export function validateCallableCatalog(catalog) {
  const primitives = catalogPrimitives(catalog);
  return Object.freeze({
    schema: 'xiio.sdk.callable-catalog-validation/v1',
    state: 'VALID',
    primitive_count: primitives.length,
    identity_unique: true,
    callable_uuid_unique: true,
    effect_authority: false,
    provider_effect: false,
  });
}

export function resolveCallable(catalog, callableUuid) {
  const primitives = catalogPrimitives(catalog);
  const uuid = String(callableUuid ?? '').trim().toLowerCase();
  if (!UUID.test(uuid)) return null;
  return primitives.find(item => String(item.callable_uuid).toLowerCase() === uuid) ?? null;
}

export function callableUuidFor(catalog, primitiveId) {
  const primitives = catalogPrimitives(catalog);
  const id = String(primitiveId ?? '').trim();
  return primitives.find(item => item.id === id)?.callable_uuid ?? null;
}

export function listCallablePrimitives(catalog) {
  const primitives = catalogPrimitives(catalog);
  return primitives.map(({ id, callable_uuid, family, kind, export: exportName, specifier, styles = [], maturity }) => ({
    id,
    callable_uuid,
    family,
    kind,
    export: exportName,
    specifier,
    styles: [...styles],
    maturity,
  }));
}
