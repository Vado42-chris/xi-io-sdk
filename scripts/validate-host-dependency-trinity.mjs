import assert from 'node:assert/strict';
import { hostDependencyTrinity } from '../src/graphs/host-dependency-trinity.mjs';

const env = name => ({schema:'xiio.host-dependencies/v1',host_ref:'host:game',environment_ref:`env:${name}`,requirements:[
  {binding_key:'issuer',owner_ref:'identity',target_ref:'service:issuer',face:'EXTERNAL',affected_project_refs:['project:game']},
  {binding_key:'db',owner_ref:'storage',target_ref:'binding:db',face:'INTERNAL',affected_project_refs:['project:game']},
  {binding_key:'ward',owner_ref:'admission',target_ref:'service:ward',face:'GLASS',affected_project_refs:['project:game']},
]});
const input={schema:'xiio.host-dependency-trinity/v1',environments:{development:env('development'),test:env('test'),production:env('production')}};
const result=hostDependencyTrinity(input);
assert.equal(result.denominator.environments,3);
assert.equal(result.denominator.bindings,9);
assert.equal(result.coverage_gaps.length,0);
assert.equal(result.identity_drift.length,0);
assert.equal(result.runtime_first_red,'AUTHENTICATED_HOST_PROVIDER_READBACK_REQUIRED');
assert(result.environments.production.every(edge=>edge.state==='UNKNOWN'&&edge.currentness==='UNKNOWN'));
assert.equal(result.provider_effect,false);
assert.equal(result.authority_granted,false);
assert.throws(()=>hostDependencyTrinity({...input,environments:{development:env('development'),production:env('production')}}),/HOST_TRINITY_ENVIRONMENTS_INVALID/);
assert.throws(()=>hostDependencyTrinity({...input,environments:{...input.environments,staging:env('staging')}}),/HOST_TRINITY_ENVIRONMENTS_INVALID/);
assert.throws(()=>hostDependencyTrinity({...input,environments:{...input.environments,test:env('development')}}),/HOST_TRINITY_ENVIRONMENT_REF_MISMATCH/);
assert.throws(()=>hostDependencyTrinity({...input,environments:{...input.environments,test:{...env('test'),host_ref:'host:foreign'}}}),/HOST_TRINITY_HOST_REF_MISMATCH/);
const different=structuredClone(input);
different.environments.test.requirements.pop();
assert.deepEqual(hostDependencyTrinity(different).coverage_gaps,[{environment:'test',dependency_key:'host.ward'}]);
const drift=structuredClone(input);
drift.environments.production.requirements[2].owner_ref='different-ward';
assert.deepEqual(hostDependencyTrinity(drift).identity_drift,[{
  dependency_key:'host.ward',bindings:[
    {environment:'development',owner_ref:'admission',face:'GLASS'},
    {environment:'test',owner_ref:'admission',face:'GLASS'},
    {environment:'production',owner_ref:'different-ward',face:'GLASS'},
  ],
}]);
const malformed=structuredClone(input);
malformed.environments.test.requirements[0].affected_project_refs=[];
assert.throws(()=>hostDependencyTrinity(malformed),/HOST_DEPENDENCY_REQUIREMENT_INVALID/);
const truncated=structuredClone(input);
delete truncated.environments.test.requirements[0].target_ref;
assert.throws(()=>hostDependencyTrinity(truncated),/HOST_DEPENDENCY_REQUIREMENT_INVALID/);
const coerced=structuredClone(input);
coerced.environments.development.host_ref={toString:()=> 'host:game'};
assert.throws(()=>hostDependencyTrinity(coerced),/HOST_DEPENDENCY_MANIFEST_INVALID/);
const numeric=structuredClone(input);
numeric.environments.production.host_ref=123;
assert.throws(()=>hostDependencyTrinity(numeric),/HOST_DEPENDENCY_MANIFEST_INVALID/);
const forged=structuredClone(input);
forged.environments.development.requirements[0].state='PASS';
assert.equal(hostDependencyTrinity(forged).environments.development[0].state,'UNKNOWN');
console.log('HOST_DEPENDENCY_TRINITY_PASS');
