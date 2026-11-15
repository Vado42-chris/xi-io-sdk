/** Resolve a registered product's install scope without performing effects. */
export const PRODUCT_INSTALL_CLOSURE_SCHEMA = 'xiio.product-install-closure/v1';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function resolveProductInstallClosure(input) {
  if (input?.schema !== PRODUCT_INSTALL_CLOSURE_SCHEMA ||
      !input.registry || typeof input.registry !== 'object' || Array.isArray(input.registry) ||
      typeof input.product_ref !== 'string' || !KEY.test(input.product_ref) ||
      (input.mode !== 'product' && input.mode !== 'suite')) throw new TypeError('INSTALL_SCOPE_INVALID');
  const registry = input.registry;
  const ids = Object.keys(registry);
  if (!ids.length || ids.some(id => !KEY.test(id))) throw new TypeError('INSTALL_REGISTRY_INVALID');
  const normalized = new Map();
  for (const id of ids) {
    const node = registry[id];
    if (!node || typeof node !== 'object' || Array.isArray(node) || node.ref !== id ||
        !['product', 'service'].includes(node.kind) ||
        !Array.isArray(node.dependencies) || node.dependencies.some(d => typeof d !== 'string' || !KEY.test(d)) ||
        new Set(node.dependencies).size !== node.dependencies.length || node.dependencies.includes(id)) {
      throw new TypeError('INSTALL_NODE_INVALID:' + id);
    }
    normalized.set(id, node);
  }
  if (!normalized.has(input.product_ref) || normalized.get(input.product_ref).kind !== 'product') {
    throw new TypeError('INSTALL_PRODUCT_UNKNOWN');
  }
  const roots = input.mode === 'suite'
    ? ids.filter(id => normalized.get(id).kind === 'product').sort()
    : [input.product_ref];
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];
  function visit(id) {
    if (!normalized.has(id)) throw new TypeError('INSTALL_DEPENDENCY_MISSING:' + id);
    if (visiting.has(id)) throw new TypeError('INSTALL_DEPENDENCY_CYCLE:' + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of normalized.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  }
  for (const root of roots) visit(root);
  return Object.freeze({
    schema: 'xiio.product-install-plan/v1',
    mode: input.mode,
    selected_product_ref: input.product_ref,
    product_roots: Object.freeze(roots),
    install_order: Object.freeze(ordered),
    headless_services: Object.freeze(ordered.filter(id => normalized.get(id).kind === 'service')),
    visible_products: Object.freeze(roots),
    state: 'PLAN_ONLY',
    installed: false,
    authority_granted: false,
    provider_effect: false,
    runtime_first_red: 'QUALIFIED_INSTALLER_ADAPTER_AND_WARD_READBACK_REQUIRED',
  });
}
