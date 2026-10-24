import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileWorkerLifecycleKit, workerLifecyclePrimitiveCatalog } from '../src/worker/lifecycle.mjs';
import primitiveCatalog from '../src/catalog/primitives.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };

const catalog=workerLifecyclePrimitiveCatalog();
assert.equal(catalog.schema,'xiio.sdk.worker-lifecycle-kit/v1');
assert.equal(catalog.available_count,11);
assert.equal(catalog.gap_count,4);
assert.equal(catalog.authority_granted,false);
assert.equal(catalog.provider_effect,false);

const compiled=compileWorkerLifecycleKit({generation:'sdk:test-generation'});
assert.equal(compiled.denominator,15);
assert.equal(compiled.selected_count,15);
assert.equal(compiled.available_count,11);
assert.equal(compiled.gap_count,4);
assert.deepEqual(compiled.tool_projection,[]);
assert.equal(compiled.authority_granted,false);
assert.equal(compiled.provider_effect,false);

const atomic=compiled.selected.find((row)=>row.id==='atomic_protected_read');
assert.equal(atomic?.state,'GAP_FAIL_CLOSED');
assert.equal(atomic?.owner_ref,'xi-io.net#351+xi-io.net#302');
assert.ok(compiled.hard.includes('CHECK_THEN_FETCH!=ATOMIC_AUTHORIZED_READ'));
assert.ok(compiled.hard.includes('NO_ATOMIC_AUTHORIZED_READ=>REFUSE'));

for(const row of compiled.selected.filter((item)=>item.state==='AVAILABLE')){
  const key=row.specifier.replace('@xi-io/sdk','.');
  assert.ok(pkg.exports[key],`missing package export for ${row.id}: ${key}`);
}

const registered=primitiveCatalog.primitives.find((row)=>row.id==='worker-lifecycle-kit');
assert.ok(registered,'worker-lifecycle-kit is registered');
assert.equal(registered.source,'src/worker/lifecycle.mjs');
assert.equal(registered.specifier,'@xi-io/sdk/worker/lifecycle');
assert.equal(primitiveCatalog.dispatch.expected,primitiveCatalog.primitives.length);
assert.equal(primitiveCatalog.dispatch.materialized_primitives,primitiveCatalog.primitives.length);

assert.throws(
  ()=>compileWorkerLifecycleKit({generation:'sdk:test-generation',applicable_ids:['not-a-worker-primitive']}),
  /applicable_id_UNKNOWN/,
);
assert.throws(()=>compileWorkerLifecycleKit({}),/generation_INVALID/);

const source=fs.readFileSync(new URL('../src/worker/lifecycle.mjs',import.meta.url),'utf8');
assert.doesNotMatch(source,/effect_authority\s*:\s*true/);
assert.doesNotMatch(source,/provider_effect\s*:\s*true/);

console.log(JSON.stringify({
  state:'PASS',
  schema:catalog.schema,
  registered_primitive:'worker-lifecycle-kit',
  denominator:compiled.denominator,
  available:compiled.available_count,
  gaps:compiled.gap_count,
  tool_projection:compiled.tool_projection.length,
  authority_granted:false,
  provider_effect:false,
},null,2));
