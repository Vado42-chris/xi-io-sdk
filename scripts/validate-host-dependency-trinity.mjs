import assert from 'node:assert/strict';
import { hostDependencyTrinity } from '../src/graphs/host-dependency-trinity.mjs';

const env = name => ({schema:'xiio.host-dependencies/v1',host_ref:'host:game',environment_ref:`env:${name}`,requirements:[
  {binding_key:'issuer',owner_ref:'identity',target_ref:'service:issuer',face:'EXTERNAL',affected_project_refs:['project:game']},
  {binding_key:'db',owner_ref:'storage',target_ref:'binding:db',face:'INTERNAL',affected_project_refs:['project:game']},
  {binding_key:'ward',owner_ref:'admission',target_ref:'service:ward',face:'GLASS',affected_project_refs:['project:game']},
]});
const input={schema:'xiio.host-dependency-trinity/v1',required_environment_refs:['env:development','env:test','env:production'],environments:{development:env('development'),test:env('test'),production:env('production')}};
const result=hostDependencyTrinity(input);
assert.equal(result.denominator.environments,3);
assert.equal(result.denominator.bindings,9);
assert.deepEqual(result.required_environment_refs,input.required_environment_refs);
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
const four={schema:'xiio.host-dependency-trinity/v1',required_environment_refs:['env:development','env:test','env:staging','env:production'],environments:{development:env('development'),test:env('test'),staging:env('staging'),production:env('production')}};
const fourResult=hostDependencyTrinity(four);
assert.equal(fourResult.denominator.environments,4);
assert.equal(fourResult.denominator.bindings,12);
assert.deepEqual(Object.keys(fourResult.environments),['development','test','staging','production']);
const two={schema:'xiio.host-dependency-trinity/v1',required_environment_refs:['env:preview','env:production'],environments:{preview:env('preview'),production:env('production')}};
assert.equal(hostDependencyTrinity(two).denominator.environments,2);
const inferred=hostDependencyTrinity({schema:'xiio.host-dependency-trinity/v1',environments:{preview:env('preview'),production:env('production')}});
assert.deepEqual(inferred.required_environment_refs,['env:preview','env:production']);
let effects=0;
const proxyEnvironments=new Proxy(input.environments,{ownKeys(){effects++;return Reflect.ownKeys(input.environments)}});
hostDependencyTrinity({...input,environments:proxyEnvironments});
assert.equal(effects,1);
const accessor={...input,environments:{...input.environments}};
Object.defineProperty(accessor.environments,'test',{enumerable:true,get(){effects++;return env('test')}});
assert.throws(()=>hostDependencyTrinity(accessor),/HOST_TRINITY_ENVIRONMENTS_INVALID/);
assert.equal(effects,1);
const malformed=structuredClone(input);
malformed.environments.test.requirements[0].affected_project_refs=[];
assert.throws(()=>hostDependencyTrinity(malformed),/HOST_DEPENDENCY_REQUIREMENT_INVALID/);
const forged=structuredClone(input);
forged.environments.development.requirements[0].state='PASS';
assert.equal(hostDependencyTrinity(forged).environments.development[0].state,'UNKNOWN');
// An explicit required denominator must never collapse to the supplied subset.
for (const invalid of [null, undefined, {}, 'env:development,env:test,env:production']) {
  assert.throws(() => hostDependencyTrinity({...input, required_environment_refs:invalid,
    environments:{development:env('development')}}), /HOST_TRINITY_REQUIRED_ENVIRONMENT_INVALID/);
}
let denominatorReads=0;
const denominatorAccessor={...input};
Object.defineProperty(denominatorAccessor,'required_environment_refs',{get(){denominatorReads++;return input.required_environment_refs;}});
assert.throws(()=>hostDependencyTrinity(denominatorAccessor),/HOST_TRINITY_ACCESSOR_REFUSED/);
const itemAccessor={...input,required_environment_refs:[...input.required_environment_refs]};
Object.defineProperty(itemAccessor.required_environment_refs,'0',{get(){denominatorReads++;return 'env:development';}});
assert.throws(()=>hostDependencyTrinity(itemAccessor),/HOST_TRINITY_REQUIRED_ENVIRONMENT_INVALID/);
const sparse={...input,required_environment_refs:new Array(3)};
assert.throws(()=>hostDependencyTrinity(sparse),/HOST_TRINITY_REQUIRED_ENVIRONMENT_INVALID/);
assert.equal(denominatorReads,0);
// White-label callers retain distinct product identity and configurable environment names.
for(const product of ['school','law']) {
 const configured={schema:'xiio.host-dependency-trinity/v1',required_environment_refs:['env:dev','env:test','env:live'],
  environments:Object.fromEntries(['dev','test','live'].map(name=>[name,{...env(name),host_ref:`host:${product}`}]))};
 const projected=hostDependencyTrinity(configured);
 assert.equal(projected.host_ref,`host:${product}`);
 assert.deepEqual(projected.required_environment_refs,['env:dev','env:test','env:live']);
 assert.equal(projected.state,'UNKNOWN');
 assert.equal(projected.authority_granted,false);
}
console.log('HOST_DEPENDENCY_TRINITY_PASS');

