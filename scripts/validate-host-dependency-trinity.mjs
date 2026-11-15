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
const forged=structuredClone(input);
forged.environments.development.requirements[0].state='PASS';
assert.equal(hostDependencyTrinity(forged).environments.development[0].state,'UNKNOWN');
console.log('HOST_DEPENDENCY_TRINITY_PASS');
