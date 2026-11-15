import { hostDependencyEdges } from './host-dependency-edges.mjs';

const REQUIRED_ENVIRONMENTS = Object.freeze(['development', 'test', 'production']);

/** Structural host-neutral intake, never proof of deployment or authority. */
export function hostDependencyTrinity(input) {
  if (input?.schema !== 'xiio.host-dependency-trinity/v1' || !input.environments ||
      typeof input.environments !== 'object' || Array.isArray(input.environments)) {
    throw new TypeError('HOST_TRINITY_INVALID');
  }
  const keys = Object.keys(input.environments).sort();
  if (keys.length !== 3 || keys.some((key, index) => key !== [...REQUIRED_ENVIRONMENTS].sort()[index])) {
    throw new TypeError('HOST_TRINITY_ENVIRONMENTS_INVALID');
  }
  const hostRefs = new Set();
  const result = {};
  for (const environment of REQUIRED_ENVIRONMENTS) {
    const manifest = input.environments[environment];
    if (manifest?.environment_ref !== `env:${environment}`) {
      throw new TypeError('HOST_TRINITY_ENVIRONMENT_REF_MISMATCH');
    }
    result[environment] = hostDependencyEdges(manifest);
    hostRefs.add(manifest.host_ref);
  }
  if (hostRefs.size !== 1) throw new TypeError('HOST_TRINITY_HOST_REF_MISMATCH');
  const requirementKeys = Object.fromEntries(REQUIRED_ENVIRONMENTS.map(environment => [
    environment, result[environment].map(edge => edge.dependency_key).sort(),
  ]));
  // Divergent requirements may be intentional, but must remain visible to receiving owners.
  const allKeys = [...new Set(Object.values(requirementKeys).flat())].sort();
  const coverageGaps = allKeys.flatMap(key => REQUIRED_ENVIRONMENTS
    .filter(environment => !requirementKeys[environment].includes(key))
    .map(environment => ({ environment, dependency_key: key })));
  return Object.freeze({
    schema: 'xiio.host-dependency-trinity-projection/v1',
    host_ref: [...hostRefs][0],
    environments: Object.freeze(result),
    denominator: Object.freeze({ environments: 3, bindings: Object.values(result).reduce((n, edges) => n + edges.length, 0) }),
    coverage_gaps: Object.freeze(coverageGaps),
    state: 'UNKNOWN', currentness: 'UNKNOWN', provider_effect: false, authority_granted: false,
  });
}
