import assert from 'node:assert/strict';
import { validateDistributedAck } from '../src/acks/distributed.mjs';

const digest='a'.repeat(64);
const formulaDigest='b'.repeat(64);
const base={
  ack_id:'ack-001',root_ref:'root-001',work_ref:'work-001',baseline_generation:'sdk-main-001',
  target_ref:'worker-001',provider_family:'local-ollama',agent_ref:'agent:ollama:aries',
  capability_profile_ref:'profile:local-agent',subject_generation:'work-g1',effect_ceiling:'NO_EFFECT',
  ack_state:'ACK',attempt:0,return_target_ref:'return-001',observed_at:'2026-09-13T23:30:00Z',
  source_store_ref:'ollama://aries/xiio-source',source_basis_ref:'local-source://xiio/current',
  source_basis_generation:'source-g1',source_basis_digest:digest,
  dogfood_formula_ref:'local-source://xiio/dogfood-formula/v1',dogfood_formula_digest:formulaDigest,
};
const readback={
  source_store_ref:base.source_store_ref,source_basis_ref:base.source_basis_ref,
  source_basis_generation:base.source_basis_generation,source_basis_digest:base.source_basis_digest,
  dogfood_formula_ref:base.dogfood_formula_ref,dogfood_formula_digest:base.dogfood_formula_digest,
  readback_ref:'local-receipt://aries/source-readback/001',verified:true,observed_at:'2026-09-13T23:30:01Z',
};

const ok=validateDistributedAck(base,readback);
assert.equal(ok.ok,true,JSON.stringify(ok));
assert.equal(ok.proof_state,'SOURCE_BOUND_STRUCTURAL_ONLY');
assert.equal(ok.authenticated,false);
assert.equal(ok.authority_granted,false);

const missing=validateDistributedAck(Object.fromEntries(Object.entries(base).filter(([k])=>!k.startsWith('source_') && !k.startsWith('dogfood_'))),null);
assert.equal(missing.ok,false);
assert.ok(missing.errors.some(x=>x.startsWith('MISSING:')));
assert.ok(missing.errors.includes('SOURCE_BASIS_READBACK_REQUIRED'));

const driveProjection={...base,source_store_ref:'drive:1abc'};
const driveResult=validateDistributedAck(driveProjection,{...readback,source_store_ref:'drive:1abc'});
assert.equal(driveResult.ok,false);
assert.ok(driveResult.errors.includes('SOURCE_STORE_PROJECTION_ONLY'));

const gitFormula={...base,dogfood_formula_ref:'github:Vado42-chris/xi-io.net/standards/punchcards/dogfood-formula.v1.json'};
const gitFormulaResult=validateDistributedAck(gitFormula,{...readback,dogfood_formula_ref:gitFormula.dogfood_formula_ref});
assert.equal(gitFormulaResult.ok,false);
assert.ok(gitFormulaResult.errors.includes('DOGFOOD_FORMULA_PROJECTION_ONLY'));

const mismatch=validateDistributedAck(base,{...readback,dogfood_formula_digest:'c'.repeat(64)});
assert.equal(mismatch.ok,false);
assert.ok(mismatch.errors.includes('SOURCE_READBACK_MISMATCH:dogfood_formula_digest'));

const malformed=validateDistributedAck({...base,source_basis_digest:'not-a-digest'},{...readback,source_basis_digest:'not-a-digest'});
assert.equal(malformed.ok,false);
assert.ok(malformed.errors.includes('SOURCE_BASIS_DIGEST_INVALID'));

console.log('DISTRIBUTED_ACK_SOURCE_BASIS_PASS cases=6 provider_effects=0 authority=0');
