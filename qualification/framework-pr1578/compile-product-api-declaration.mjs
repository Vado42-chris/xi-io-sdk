export function resolveProductApiOperation({
  declaration,
  currentness,
  product_ref,
  api_ref,
  capability_ref,
  operation_ref,
  role,
} = {}) {
  if (!declaration || currentness?.state !== 'CURRENT' || currentness?.custody_verified !== true) {
    throw Object.assign(new TypeError('API_DECLARATION_CURRENTNESS_REQUIRED'), {code:'API_DECLARATION_CURRENTNESS_REQUIRED'});
  }
  const operation = declaration.operations?.find((row) =>
    row.capability_ref === capability_ref && row.operation_ref === operation_ref);
  const blockers = [];
  if (declaration.product_ref !== product_ref || declaration.api_ref !== api_ref) blockers.push('API_DECLARATION_IDENTITY_MISMATCH');
  if (!operation) blockers.push('API_OPERATION_NOT_DECLARED');
  if (operation && !operation.eligible_roles.includes(role)) blockers.push('ROLE_NOT_ELIGIBLE');
  return Object.freeze({
    matched:blockers.length === 0,
    blockers:Object.freeze(blockers),
    declaration_ref:declaration.declaration_ref,
    declaration_generation:declaration.declaration_generation,
    currentness_ref:currentness.currentness_ref,
    declaration_custody_verified:true,
    dependency_id:'inbox-runtime',
    owner_repo:'Vado42-chris/xi-io-Inbox',
    accepted_generation:'b'.repeat(40),
    billing_mode:operation?.billing_mode ?? null,
    meter_unit_type:operation?.meter_unit_type ?? null,
  });
}
