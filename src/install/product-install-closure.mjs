/** Resolve a registered product's install scope without performing effects. */
export const PRODUCT_INSTALL_CLOSURE_SCHEMA = 'xiio.product-install-closure/v1';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function readOwnData(object, key, code='INSTALL_ACCESSOR_REFUSED:' + String(key)) {
  if (!object || typeof object !== 'object') throw new TypeError(code);
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new TypeError(code);
  return descriptor.value;
}
function ownDataEntries(object) {
  const descriptors=Object.getOwnPropertyDescriptors(object);
  const keys=Reflect.ownKeys(descriptors);
  if(keys.some(key=>typeof key!=='string'||!Object.hasOwn(descriptors[key],'value'))) throw new TypeError('INSTALL_REGISTRY_ACCESSOR_REFUSED');
  return keys.map(key=>[key,descriptors[key].value]);
}

export function resolveProductInstallClosure(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('INSTALL_SCOPE_INVALID');
  const schema=readOwnData(input,'schema');
  const registry=readOwnData(input,'registry');
  const productRef=readOwnData(input,'product_ref');
  const mode=readOwnData(input,'mode');
  if (schema !== PRODUCT_INSTALL_CLOSURE_SCHEMA ||
      !registry || typeof registry !== 'object' || Array.isArray(registry) ||
      typeof productRef !== 'string' || !KEY.test(productRef) ||
      (mode !== 'product' && mode !== 'suite')) throw new TypeError('INSTALL_SCOPE_INVALID');
  const entries=ownDataEntries(registry);
  const ids=entries.map(([id])=>id);
  if (!ids.length || ids.some(id => !KEY.test(id))) throw new TypeError('INSTALL_REGISTRY_INVALID');
  const normalized = new Map();
  for (const [id,node] of entries) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new TypeError('INSTALL_NODE_INVALID:' + id);
    const ref = readOwnData(node, 'ref');
    const kind = readOwnData(node, 'kind');
    const declaredDependencies = readOwnData(node, 'dependencies');
    if (!Array.isArray(declaredDependencies)) throw new TypeError('INSTALL_NODE_INVALID:' + id);
    const dependencies = Array.from({ length: declaredDependencies.length }, (_, index) =>
      readOwnData(declaredDependencies, String(index)));
    if (ref !== id || !['product', 'service'].includes(kind) ||
        dependencies.some(d => typeof d !== 'string' || !KEY.test(d)) ||
        new Set(dependencies).size !== dependencies.length || dependencies.includes(id)) {
      throw new TypeError('INSTALL_NODE_INVALID:' + id);
    }
    normalized.set(id, { ref, kind, dependencies });
  }
  if (!normalized.has(productRef) || normalized.get(productRef).kind !== 'product') throw new TypeError('INSTALL_PRODUCT_UNKNOWN');
  const roots = mode === 'suite' ? ids.filter(id => normalized.get(id).kind === 'product').sort() : [productRef];
  const visiting = new Set(), visited = new Set(), ordered = [];
  function visit(id) {
    if (!normalized.has(id)) throw new TypeError('INSTALL_DEPENDENCY_MISSING:' + id);
    if (visiting.has(id)) throw new TypeError('INSTALL_DEPENDENCY_CYCLE:' + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of normalized.get(id).dependencies) visit(dependency);
    visiting.delete(id); visited.add(id); ordered.push(id);
  }
  for (const root of roots) visit(root);
  return Object.freeze({
    schema: 'xiio.product-install-plan/v1', mode, selected_product_ref: productRef,
    product_roots: Object.freeze(roots), install_order: Object.freeze(ordered),
    headless_services: Object.freeze(ordered.filter(id => normalized.get(id).kind === 'service')),
    visible_products: Object.freeze(roots), state: 'PLAN_ONLY', installed: false,
    authority_granted: false, provider_effect: false,
    runtime_first_red: 'QUALIFIED_INSTALLER_ADAPTER_AND_WARD_READBACK_REQUIRED',
  });
}
