/**
 * Host-neutral requirements intake for the existing dependency cube.
 * This is structural discovery only, never an authenticated deployment verifier.
 */
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FACES = new Set(['INTERNAL', 'EXTERNAL', 'GLASS']);
const ownData = (object,key,code) => {
  const descriptor=Object.getOwnPropertyDescriptor(object,key);
  if(!descriptor || !Object.hasOwn(descriptor,'value')) throw new TypeError(code);
  return descriptor.value;
};

export function hostDependencyEdges(manifest) {
  if(!manifest || typeof manifest!=='object' || Array.isArray(manifest)) throw new TypeError('HOST_DEPENDENCY_MANIFEST_INVALID');
  const schema=ownData(manifest,'schema','HOST_DEPENDENCY_ACCESSOR_REFUSED');
  const host_ref=ownData(manifest,'host_ref','HOST_DEPENDENCY_ACCESSOR_REFUSED');
  const environment_ref=ownData(manifest,'environment_ref','HOST_DEPENDENCY_ACCESSOR_REFUSED');
  const requirements=ownData(manifest,'requirements','HOST_DEPENDENCY_ACCESSOR_REFUSED');
  if (schema !== 'xiio.host-dependencies/v1' ||
      typeof host_ref !== 'string' || !KEY.test(host_ref) ||
      typeof environment_ref !== 'string' || !KEY.test(environment_ref) ||
      !Array.isArray(requirements) || requirements.length === 0) throw new TypeError('HOST_DEPENDENCY_MANIFEST_INVALID');
  const seen = new Set();
  return Array.from({length:requirements.length},(_,index)=>{
    const requirement=ownData(requirements,String(index),'HOST_DEPENDENCY_REQUIREMENT_ACCESSOR_REFUSED');
    if(!requirement || typeof requirement!=='object' || Array.isArray(requirement)) throw new TypeError('HOST_DEPENDENCY_REQUIREMENT_INVALID');
    const binding_key=ownData(requirement,'binding_key','HOST_DEPENDENCY_REQUIREMENT_ACCESSOR_REFUSED');
    const owner_ref=ownData(requirement,'owner_ref','HOST_DEPENDENCY_REQUIREMENT_ACCESSOR_REFUSED');
    const target_ref=ownData(requirement,'target_ref','HOST_DEPENDENCY_REQUIREMENT_ACCESSOR_REFUSED');
    const face=ownData(requirement,'face','HOST_DEPENDENCY_REQUIREMENT_ACCESSOR_REFUSED');
    const affected_project_refs=ownData(requirement,'affected_project_refs','HOST_DEPENDENCY_REQUIREMENT_ACCESSOR_REFUSED');
    if (![binding_key, owner_ref, target_ref].every(x => typeof x === 'string' && KEY.test(x)) ||
        !FACES.has(face) || !Array.isArray(affected_project_refs) ||
        !affected_project_refs.length) throw new TypeError('HOST_DEPENDENCY_REQUIREMENT_INVALID');
    const affected=Array.from({length:affected_project_refs.length},(_,affectedIndex)=>
      ownData(affected_project_refs,String(affectedIndex),'HOST_DEPENDENCY_REQUIREMENT_ACCESSOR_REFUSED'));
    if(!affected.every(x => typeof x === 'string' && KEY.test(x)) || seen.has(binding_key))
      throw new TypeError('HOST_DEPENDENCY_REQUIREMENT_INVALID');
    seen.add(binding_key);
    return Object.freeze({
      edge_id: `host:${host_ref}:${environment_ref}:${binding_key}`,
      dependency_key: `host.${binding_key}`,
      target_ref,
      owner_ref,
      relationship_ref: `host-binding:${host_ref}:${environment_ref}:${binding_key}`,
      state: 'UNKNOWN', currentness: 'UNKNOWN',
      evidence_refs: [],
      wake: `VERIFY_HOST_BINDING:${host_ref}:${environment_ref}:${binding_key}`,
      affected_project_refs: [...new Set(affected)].sort(),
      provider_effect: false, authority_granted: false,
      face,
    });
  });
}
