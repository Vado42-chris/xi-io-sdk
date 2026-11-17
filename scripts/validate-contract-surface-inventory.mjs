import assert from 'node:assert/strict';
import {
  compileContractSurfaceInventory,
  compileContractSurfaceRecord,
  CONTRACT_SURFACE_INVENTORY_SCHEMA,
} from '../src/catalog/contract-surface-inventory.mjs';

let checks=0;
const base={
  contract_id:'contract:sam-law:documents',
  contract_version:'v1',
  semantic_owner_ref:'github:Vado42-chris/xi-io-sam_law-oct27_2026#15',
  source_ref:'source:sam-law:documents-api',
  source_generation:'generation:sam-law:documents-api:g1',
  implementation_ref:'impl:sam-law:document-host',
  adapter_ref:'adapter:sam-law:http',
  adapter_generation:'generation:adapter:sam-law:http:g1',
  provider_runtime_class:'local-http',
  surface_role:'API',
  operation_ref:'operation:sam-law:document:read',
  effect_class:'READ_ONLY',
  applicability_ref:'applicability:sam-law:document-read',
  qualification_ref:'qualification:sam-law:document-read:g1',
  authority_ref:null,
  readback_ref:null,
  return_ref:null,
  declared:true,
  implemented:true,
  applicable:true,
  qualified:true,
  current:true,
  authorized:false,
  observed_verified:false,
  availability:'AVAILABLE',
  blocker_refs:[],
  invalidator_refs:[],
};

let out=compileContractSurfaceRecord(base);
assert.equal(out.schema,CONTRACT_SURFACE_INVENTORY_SCHEMA);
assert.equal(out.state,'CURRENT_SUPPORTED');
assert.equal(out.callable,true);
assert.equal(out.authority_granted,false);
assert.equal(out.provider_effect,false);
checks+=5;

out=compileContractSurfaceRecord({...base,current:false,availability:'UNKNOWN',qualification_ref:'qualification:sam-law:document-read:g1'});
assert.equal(out.state,'STRUCTURAL_ONLY');
assert.equal(out.callable,false);
checks+=2;

assert.throws(
  ()=>compileContractSurfaceRecord({...base,declared:false}),
  /IMPLEMENTED_REQUIRES_DECLARED/,
);
assert.throws(
  ()=>compileContractSurfaceRecord({...base,qualified:false,current:true}),
  /CURRENT_REQUIRES_QUALIFIED/,
);
out=compileContractSurfaceRecord({...base,authorized:true,authority_ref:null});
assert.equal(out.state,'REFUSED');
assert.ok(out.blockers.includes('AUTHORIZED_REQUIRES_AUTHORITY_REF'));
checks+=4;

out=compileContractSurfaceRecord({...base,availability:'N_A',applicable:false,qualified:false,current:false});
assert.equal(out.state,'STRUCTURAL_ONLY');
assert.equal(out.callable,false);
checks+=2;

out=compileContractSurfaceRecord({...base,invalidator_refs:['invalidator:adapter:g2']});
assert.equal(out.state,'REFUSED');
assert.ok(out.blockers.includes('CURRENT_WITH_ACTIVE_INVALIDATORS'));
checks+=2;

const inventory=compileContractSurfaceInventory({
  inventory_ref:'inventory:sdk:current-surfaces',
  generation:'generation:sdk:current-surfaces:g1',
  records:[
    base,
    {
      ...base,
      contract_id:'contract:inbox:mail',
      semantic_owner_ref:'github:Vado42-chris/xi-io-Inbox#148',
      source_ref:'source:inbox:mail-api',
      source_generation:'generation:inbox:mail-api:g1',
      implementation_ref:null,
      adapter_ref:null,
      adapter_generation:null,
      provider_runtime_class:null,
      operation_ref:'operation:inbox:mail:list',
      applicability_ref:'applicability:inbox:mail-list',
      qualification_ref:null,
      declared:true,
      implemented:false,
      applicable:false,
      qualified:false,
      current:false,
      authorized:false,
      observed_verified:false,
      availability:'UNKNOWN',
    },
  ],
});
assert.equal(inventory.counts.total,2);
assert.equal(inventory.counts.current_supported,1);
assert.equal(inventory.counts.unresolved,1);
assert.equal(inventory.release_eligible,false);
assert.equal(inventory.authority_granted,false);
assert.equal(inventory.provider_effect,false);
checks+=6;

assert.throws(
  ()=>compileContractSurfaceInventory({
    inventory_ref:'inventory:dup',
    generation:'generation:dup:g1',
    records:[base,{...base}],
  }),
  /CONTRACT_INVENTORY_DUPLICATE_SURFACE/,
);
checks++;

console.log(JSON.stringify({
  mode:'CONTRACT_SURFACE_INVENTORY',
  result:'PASS',
  checks,
  declared_implemented_split:true,
  qualification_currentness_split:true,
  authorization_observation_split:true,
  unknown_preserved:true,
  effects:0,
}));
