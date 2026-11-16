import { hostDependencyEdges } from './host-dependency-edges.mjs';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ownData = (object, key, code) => {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError(code);
  return descriptor.value;
};
const environmentRef = key => key.startsWith('env:') ? key : `env:${key}`;

/** Structural host-neutral intake, never proof of deployment or authority. */
export function hostDependencyTrinity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('HOST_TRINITY_INVALID');
  const schema = ownData(input, 'schema', 'HOST_TRINITY_ACCESSOR_REFUSED');
  const environments = ownData(input, 'environments', 'HOST_TRINITY_ACCESSOR_REFUSED');
  const requiredInput = Object.getOwnPropertyDescriptor(input, 'required_environment_refs')?.value;
  if (schema !== 'xiio.host-dependency-trinity/v1' || !environments ||
      typeof environments !== 'object' || Array.isArray(environments)) {
    throw new TypeError('HOST_TRINITY_INVALID');
  }
  const descriptors = Object.getOwnPropertyDescriptors(environments);
  const keys = Reflect.ownKeys(descriptors);
  if (!keys.length || keys.some(key => typeof key !== 'string' || !KEY.test(key) ||
      !Object.hasOwn(descriptors[key], 'value'))) throw new TypeError('HOST_TRINITY_ENVIRONMENTS_INVALID');
  const declared = Array.isArray(requiredInput)
    ? requiredInput.map((ref) => {
        if (typeof ref !== 'string' || !KEY.test(ref)) throw new TypeError('HOST_TRINITY_REQUIRED_ENVIRONMENT_INVALID');
        return ref;
      })
    : keys.map(environmentRef);
  if (!declared.length || new Set(declared).size !== declared.length) throw new TypeError('HOST_TRINITY_REQUIRED_ENVIRONMENT_INVALID');
  const required = declared.map(ref => {
    const key = ref.startsWith('env:') ? ref.slice(4) : ref;
    if (!key || !KEY.test(key)) throw new TypeError('HOST_TRINITY_REQUIRED_ENVIRONMENT_INVALID');
    return { key, ref: environmentRef(ref) };
  });
  const requiredKeys = required.map(row => row.key).sort();
  const actualKeys = [...keys].sort();
  if (actualKeys.length !== requiredKeys.length || actualKeys.some((key,index)=>key!==requiredKeys[index])) {
    throw new TypeError('HOST_TRINITY_ENVIRONMENTS_INVALID');
  }
  const hostRefs = new Set();
  const result = {};
  for (const environment of required) {
    const manifest = descriptors[environment.key].value;
    const manifestEnvironmentRef = ownData(manifest, 'environment_ref', 'HOST_TRINITY_MANIFEST_ACCESSOR_REFUSED');
    if (manifestEnvironmentRef !== environment.ref) throw new TypeError('HOST_TRINITY_ENVIRONMENT_REF_MISMATCH');
    result[environment.key] = hostDependencyEdges(manifest);
    hostRefs.add(ownData(manifest, 'host_ref', 'HOST_TRINITY_MANIFEST_ACCESSOR_REFUSED'));
  }
  if (hostRefs.size !== 1) throw new TypeError('HOST_TRINITY_HOST_REF_MISMATCH');
  const requirementKeys = Object.fromEntries(required.map(environment => [
    environment.key, result[environment.key].map(edge => edge.dependency_key).sort(),
  ]));
  const allKeys = [...new Set(Object.values(requirementKeys).flat())].sort();
  const coverageGaps = allKeys.flatMap(key => required
    .filter(environment => !requirementKeys[environment.key].includes(key))
    .map(environment => ({ environment: environment.key, dependency_key: key })));
  const identityDrift = allKeys.flatMap(key => {
    const bindings = required.flatMap(environment => result[environment.key]
      .filter(edge => edge.dependency_key === key)
      .map(edge => ({ environment: environment.key, owner_ref: edge.owner_ref, face: edge.face })));
    return new Set(bindings.map(edge => `${edge.owner_ref}:${edge.face}`)).size > 1
      ? [{ dependency_key: key, bindings }] : [];
  });
  return Object.freeze({
    schema: 'xiio.host-dependency-trinity-projection/v1',
    host_ref: [...hostRefs][0],
    required_environment_refs: Object.freeze(required.map(row => row.ref)),
    environments: Object.freeze(result),
    denominator: Object.freeze({ environments: required.length, bindings: Object.values(result).reduce((n, edges) => n + edges.length, 0) }),
    coverage_gaps: Object.freeze(coverageGaps),
    identity_drift: Object.freeze(identityDrift),
    runtime_first_red: 'AUTHENTICATED_HOST_PROVIDER_READBACK_REQUIRED',
    state: 'UNKNOWN', currentness: 'UNKNOWN', provider_effect: false, authority_granted: false,
  });
}
