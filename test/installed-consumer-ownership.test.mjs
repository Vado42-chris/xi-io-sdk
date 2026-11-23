import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInstalledConsumerOwnership,
  INSTALLED_CONSUMER_OWNERSHIP_INPUT_SCHEMA,
} from '../src/install/installed-consumer-ownership.mjs';

const G='a'.repeat(40);
const B='b'.repeat(64);
const now='2026-11-23T18:30:00.000Z';
const dependency=()=>({
  dependency_id:'framework-runtime',
  owner_repo:'Vado42-chris/xi-io.net',
  accepted_generation:G,
  binding_sha256:B,
});
const coverage=(overrides={})=>({
  state:'COMPLETE',
  currentness:'CURRENT',
  observed_at:now,
  evidence_refs:['receipt:consumer-denominator:g1'],
  ...overrides,
});
const consumer=(id='sam',overrides={})=>({
  consumer_id:'consumer:'+id,
  product_id:'product:'+id,
  profile_id:'profile:'+id,
  installation_ref:'installation:'+id,
  state:'INSTALLED_READBACK_VERIFIED',
  currentness:'CURRENT',
  dependency_id:'framework-runtime',
  owner_repo:'Vado42-chris/xi-io.net',
  accepted_generation:G,
  binding_sha256:B,
  observed_at:now,
  evidence_refs:['receipt:'+id+':installed'],
  ...overrides,
});
const input=(consumers,[coverageValue]=[coverage()])=>({
  schema:INSTALLED_CONSUMER_OWNERSHIP_INPUT_SCHEMA,
  dependency:dependency(),
  coverage:coverageValue,
  consumers,
});

test('one complete current installed consumer classifies EXCLUSIVE without granting authority',()=>{
  const out=classifyInstalledConsumerOwnership(input([consumer()]));
  assert.equal(out.classification,'EXCLUSIVE');
  assert.equal(out.consumer_count,1);
  assert.equal(out.destructive_rollback_allowed,true);
  assert.equal(out.shared_resource_preservation_required,false);
  assert.equal(out.reconciliation_required,false);
  assert.equal(out.authority_granted,false);
  assert.equal(out.effect_authority,false);
});

test('two exact current installed consumers classify SHARED and preserve resource',()=>{
  const out=classifyInstalledConsumerOwnership(input([consumer('sam'),consumer('ibal')]));
  assert.equal(out.classification,'SHARED');
  assert.equal(out.consumer_count,2);
  assert.equal(out.destructive_rollback_allowed,false);
  assert.equal(out.shared_resource_preservation_required,true);
  assert.equal(out.reconciliation_required,false);
});

test('incomplete or stale denominator is UNKNOWN, never exclusive',()=>{
  for(const c of [
    coverage({state:'INCOMPLETE'}),
    coverage({state:'UNKNOWN'}),
    coverage({currentness:'STALE'}),
    coverage({currentness:'UNKNOWN'}),
  ]){
    const out=classifyInstalledConsumerOwnership(input([consumer()], [c]));
    assert.equal(out.classification,'UNKNOWN');
    assert.equal(out.destructive_rollback_allowed,false);
    assert.equal(out.reconciliation_required,true);
  }
});

test('complete denominator with zero current consumers remains UNKNOWN',()=>{
  const out=classifyInstalledConsumerOwnership(input([]));
  assert.equal(out.classification,'UNKNOWN');
  assert.equal(out.first_red,'NO_CURRENT_CONSUMER_EVIDENCE');
  assert.equal(out.destructive_rollback_allowed,false);
});

test('stale, unverified or dependency-mismatched consumer evidence is UNKNOWN',()=>{
  const cases=[
    [consumer('sam',{currentness:'STALE'}),'CONSUMER_CURRENTNESS_UNVERIFIED'],
    [consumer('sam',{state:'SOURCE_ONLY'}),'CONSUMER_INSTALLED_READBACK_UNVERIFIED'],
    [consumer('sam',{accepted_generation:'c'.repeat(40)}),'CONSUMER_DEPENDENCY_IDENTITY_MISMATCH'],
    [consumer('sam',{binding_sha256:'d'.repeat(64)}),'CONSUMER_DEPENDENCY_IDENTITY_MISMATCH'],
    [consumer('sam',{dependency_id:'other-runtime'}),'CONSUMER_DEPENDENCY_IDENTITY_MISMATCH'],
  ];
  for(const [row,reason] of cases){
    const out=classifyInstalledConsumerOwnership(input([row]));
    assert.equal(out.classification,'UNKNOWN');
    assert.equal(out.first_red,reason);
    assert.equal(out.destructive_rollback_allowed,false);
  }
});

test('duplicate consumer IDs and malformed provider identity are rejected',()=>{
  assert.throws(
    ()=>classifyInstalledConsumerOwnership(input([consumer(),consumer()])),
    /INSTALLED_CONSUMER_DUPLICATE/,
  );
  const bad=input([consumer()]);
  bad.dependency.owner_repo='not-a-repo';
  assert.throws(()=>classifyInstalledConsumerOwnership(bad),/OWNER_REPO_INVALID/);
});

test('receipt absence cannot be represented by empty evidence arrays',()=>{
  const bad=input([consumer()]);
  bad.coverage.evidence_refs=[];
  assert.throws(()=>classifyInstalledConsumerOwnership(bad),/COVERAGE_EVIDENCE_INVALID/);
  const badConsumer=input([consumer()]);
  badConsumer.consumers[0].evidence_refs=[];
  assert.throws(()=>classifyInstalledConsumerOwnership(badConsumer),/ROW_EVIDENCE_INVALID/);
});

test('accessor-backed evidence is refused without executing getter',()=>{
  let touched=false;
  const bad=input([consumer()]);
  Object.defineProperty(bad.coverage,'state',{get(){touched=true;return 'COMPLETE'}});
  assert.throws(()=>classifyInstalledConsumerOwnership(bad),/INSTALLED_CONSUMER_COVERAGE_INVALID/);
  assert.equal(touched,false);
});

test('accessor-backed consumer and evidence array elements are refused without getter execution',()=>{
  let consumerTouched=false;
  const badConsumer=input([consumer()]);
  Object.defineProperty(badConsumer.consumers,'0',{get(){consumerTouched=true;return consumer()}});
  assert.throws(()=>classifyInstalledConsumerOwnership(badConsumer),/INSTALLED_CONSUMER_ROWS_INVALID/);
  assert.equal(consumerTouched,false);

  let evidenceTouched=false;
  const badEvidence=input([consumer()]);
  Object.defineProperty(badEvidence.consumers[0].evidence_refs,'0',{get(){evidenceTouched=true;return 'receipt:forged'}});
  assert.throws(()=>classifyInstalledConsumerOwnership(badEvidence),/INSTALLED_CONSUMER_ROW_EVIDENCE_INVALID/);
  assert.equal(evidenceTouched,false);

  let coverageEvidenceTouched=false;
  const badCoverageEvidence=input([consumer()]);
  Object.defineProperty(badCoverageEvidence.coverage.evidence_refs,'0',{get(){coverageEvidenceTouched=true;return 'receipt:forged'}});
  assert.throws(()=>classifyInstalledConsumerOwnership(badCoverageEvidence),/INSTALLED_CONSUMER_COVERAGE_EVIDENCE_INVALID/);
  assert.equal(coverageEvidenceTouched,false);
});
