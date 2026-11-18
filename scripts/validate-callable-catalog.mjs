import assert from 'node:assert/strict';
import {
  validateCallableCatalog,
  resolveCallable,
  callableUuidFor,
  listCallablePrimitives,
} from '../src/callables/resolve.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const catalog={primitives:[
  {id:'alpha',callable_uuid:A,family:'test',kind:'function',export:'alpha',specifier:'@xi-io/sdk/test-alpha',styles:[],maturity:'candidate'},
  {id:'beta',callable_uuid:B,family:'test',kind:'function',export:'beta',specifier:'@xi-io/sdk/test-beta',styles:[],maturity:'candidate'},
]};

const validation=validateCallableCatalog(catalog);
assert.equal(validation.state,'VALID');
assert.equal(validation.primitive_count,2);
assert.equal(validation.identity_unique,true);
assert.equal(validation.callable_uuid_unique,true);
assert.equal(resolveCallable(catalog,A).id,'alpha');
assert.equal(callableUuidFor(catalog,'beta'),B);
assert.equal(listCallablePrimitives(catalog).length,2);

assert.throws(
  ()=>validateCallableCatalog({primitives:[catalog.primitives[0],{...catalog.primitives[1],id:'alpha'}]}),
  /CALLABLE_CATALOG_ID_DUPLICATE:alpha/,
);
assert.throws(
  ()=>resolveCallable({primitives:[catalog.primitives[0],{...catalog.primitives[1],callable_uuid:A}]},A),
  /CALLABLE_CATALOG_UUID_DUPLICATE/,
);
assert.throws(
  ()=>callableUuidFor({primitives:[{...catalog.primitives[0],callable_uuid:'not-a-uuid'}]},'alpha'),
  /CALLABLE_CATALOG_UUID_INVALID:alpha/,
);
assert.throws(
  ()=>listCallablePrimitives({primitives:[null]}),
  /CALLABLE_CATALOG_PRIMITIVE_INVALID:0/,
);

console.log(JSON.stringify({
  mode:'CALLABLE_CATALOG_IDENTITY',
  result:'PASS',
  primitive_identity_collision_refused:true,
  callable_uuid_collision_refused:true,
  invalid_uuid_refused:true,
  first_match_wins_removed:true,
  effects:0,
}));
