/**
 * Host-neutral requirements intake for the existing dependency cube.
 * This is structural discovery only, never an authenticated deployment verifier.
 */
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FACES = new Set(['INTERNAL', 'EXTERNAL', 'GLASS']);

export function hostDependencyEdges(manifest) {
  if (manifest?.schema !== 'xiio.host-dependencies/v1' || !KEY.test(manifest.host_ref) ||
      !KEY.test(manifest.environment_ref) || !Array.isArray(manifest.requirements) ||
      manifest.requirements.length === 0) throw new TypeError('HOST_DEPENDENCY_MANIFEST_INVALID');
  const seen = new Set();
  return manifest.requirements.map((requirement) => {
    const { binding_key, owner_ref, target_ref, face, affected_project_refs } = requirement || {};
    if (![binding_key, owner_ref, target_ref].every(x => typeof x === 'string' && KEY.test(x)) ||
        !FACES.has(face) || !Array.isArray(affected_project_refs) ||
        !affected_project_refs.length || !affected_project_refs.every(x => typeof x === 'string' && KEY.test(x)) ||
        seen.has(binding_key)) throw new TypeError('HOST_DEPENDENCY_REQUIREMENT_INVALID');
    seen.add(binding_key);
    // A supplied inventory or installer result is not authenticated runtime readback.
    // Only the existing dependency-cube runtime owner can promote currentness.
    return Object.freeze({
      edge_id: `host:${manifest.host_ref}:${manifest.environment_ref}:${binding_key}`,
      dependency_key: `host.${binding_key}`,
      target_ref,
      owner_ref,
      relationship_ref: `host-binding:${manifest.host_ref}:${manifest.environment_ref}:${binding_key}`,
      state: 'UNKNOWN', currentness: 'UNKNOWN',
      evidence_refs: [],
      wake: `VERIFY_HOST_BINDING:${manifest.host_ref}:${manifest.environment_ref}:${binding_key}`,
      affected_project_refs: [...new Set(affected_project_refs)].sort(),
      // Explicitly no credentials, host URLs or synthetic provider authority.
      provider_effect: false, authority_granted: false,
      face,
    });
  });
}
