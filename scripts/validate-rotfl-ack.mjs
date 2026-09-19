import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compilePortfolioBaseline, compileDistributedAcks } from '../src/baseline/compiler.mjs';
import {
  validateDistributedAck,
  validateRotflAckContext,
  validateRotflDistributedAck,
  attachRotflContextToAckSet,
} from '../src/acks/distributed.mjs';

const rotfl = {
  schema: 'xiio.sdk.rotfl-ack-context/v1',
  hvt_order_ref: 'control:hvt-order:pass7',
  knowledge_return_refs: ['crm:knowledge-return:fixture'],
  bins_resource_refs: ['bins:resource:fixture:v1'],
  reusable_tool_refs: ['sdk:cli:xi'],
  reusable_template_refs: ['template:rotfl-ack:v1'],
  template_runs: [{
    schema:'xiio.sdk.rotfl-ack-template-run/v1',
    template_ref:'template:rotfl-ack:v1',
    template_generation:'template:g1',
    runtime_ref:'runtime:rotfl-template',
    runtime_generation:'runtime:g1',
    runtime_rotfl_receipt_ref:'receipt:rotfl-template:g1',
    runtime_readback_ref:'readback:rotfl-template:g1',
    next_input_ref:'next:rotfl-template:g1',
    state:'EXECUTED',
    known_bit:1,
    value_bit:1,
    talk_action_zero_bit:1,
    time_money_bound_bit:1,
  }],
  coverage_profile_ref: 'coverage:micro-meso-macro-meta',
  truncation_denominator_ref: 'sim:3x3x3:fixture',
  affected_refs: ['work:affected:fixture'],
  no_effect_refs: ['work:no-effect:fixture'],
  first_red_ref: 'red:fixture:first',
  next_ref: 'next:fixture',
  wake_ref: 'wake:fixture',
  fallback_ref: 'fallback:fixture',
  apply_return_target_ref: 'return:apply:fixture',
  reap_refs: ['reap:fixture'],
  cold_start_readback_ref: 'crm:cold-start:fixture',
  currentness_checked_at: '2026-09-16T22:30:00-06:00',
};

const universalEffectPolicy = {
  schema:'xiio.sdk.universal-effect-policy/v1',
  effect_scope:'ACK',
  consequential:false,
  occurrence_ref:'occ:ack:fixture',
  requested_effect_ref:'ack:fixture',
  current_instruction_ref:null,
  authorizing_instruction_ref:null,
  authorized_effect_refs:[],
  draft_plan_propose_prepare_allowed:true,
  user_effect_instruction_bound:false,
  effect_attempt_eligible:false,
  effect_authority:false,
  approval_persists:false,
  prior_approval_replay_allowed:false,
};

const baseAck = {
  ack_id: 'ack:rotfl:fixture',
  root_ref: 'root:fixture',
  work_ref: 'work:fixture',
  baseline_generation: 'baseline:g1',
  target_ref: 'repo:fixture',
  provider_family: 'FUTURE_PROVIDER',
  agent_ref: 'agent:fixture',
  capability_profile_ref: 'capability:fixture',
  subject_generation: 'subject:g1',
  effect_ceiling: 'NO_EFFECT',
  ack_state: 'ACK',
  attempt: 0,
  return_target_ref: 'return:fixture',
  observed_at: '2026-09-16T22:30:00-06:00',
  effect_policy: universalEffectPolicy,
};

let checks = 0;
assert.equal(validateRotflAckContext(rotfl).ok, true); checks += 1;
assert.equal(validateRotflAckContext(rotfl).template_runtime_complete, true); checks += 1;
assert.equal(validateDistributedAck(baseAck).ok, true); checks += 1;
assert.equal(validateDistributedAck({...baseAck,effect_policy:null}).ok,false); checks += 1;
const currentEffect={...universalEffectPolicy,effect_scope:'API',consequential:true,occurrence_ref:'occ:api:1',requested_effect_ref:'api:write:1',current_instruction_ref:'instruction:current:1',authorizing_instruction_ref:'instruction:current:1',authorized_effect_refs:['api:write:1'],user_effect_instruction_bound:true,effect_attempt_eligible:true};
const currentEffectAck={...baseAck,effect_ceiling:'PROVIDER_WRITE',effect_policy:currentEffect};
assert.equal(validateDistributedAck(currentEffectAck).ok,true); checks += 1;
assert.equal(validateDistributedAck({...currentEffectAck,effect_policy:{...currentEffect,authorizing_instruction_ref:'instruction:old',user_effect_instruction_bound:false,effect_attempt_eligible:false}}).ok,false); checks += 1;
assert.equal(validateDistributedAck({...currentEffectAck,effect_policy:{...currentEffect,effect_authority:true}}).ok,false); checks += 1;
const wrongEffectVerdict=validateDistributedAck({...currentEffectAck,effect_policy:{...currentEffect,authorized_effect_refs:['api:write:OTHER'],user_effect_instruction_bound:false,effect_attempt_eligible:false}});
assert.equal(wrongEffectVerdict.ok,false); checks += 1;
assert(wrongEffectVerdict.errors.some(x=>x.includes('CURRENT_INSTRUCTION_NOT_BOUND_TO_REQUESTED_EFFECT'))); checks += 1;
assert.equal(validateRotflDistributedAck(baseAck).ok, false); checks += 1;
assert.equal(validateRotflDistributedAck({ ...baseAck, rotfl }).ok, true); checks += 1;
const incompleteRotfl=structuredClone(rotfl);
Object.assign(incompleteRotfl.template_runs[0],{state:'WAIT',known_bit:1,value_bit:0});
assert.equal(validateRotflAckContext(incompleteRotfl).ok,true); checks += 1;
assert.equal(validateRotflAckContext(incompleteRotfl).template_runtime_complete,false); checks += 1;
const terminalIncomplete=validateRotflDistributedAck({...baseAck,ack_state:'RESULT',attempt:1,rotfl:incompleteRotfl});
assert.equal(terminalIncomplete.ok,false); checks += 1;
assert(terminalIncomplete.errors.includes('ROTFL_TEMPLATE_RUNTIME_REQUIRED_BEFORE_TERMINAL_ACK_STATE')); checks += 1;

for (const field of Object.keys(rotfl)) {
  const sample = structuredClone(rotfl);
  delete sample[field];
  assert.equal(validateRotflAckContext(sample).ok, false, `missing ${field} must fail`);
  checks += 1;
}
for (const field of ['knowledge_return_refs','bins_resource_refs','reusable_tool_refs','reusable_template_refs','affected_refs','no_effect_refs','reap_refs']) {
  assert.equal(validateRotflAckContext({ ...rotfl, [field]: [] }).ok, false, `empty ${field} must fail`);
  checks += 1;
}
for (const field of ['knowledge_return_refs','bins_resource_refs']) {
  assert.equal(validateRotflAckContext({ ...rotfl, [field]: ['gmail:message:fixture'] }).ok, false);
  checks += 1;
}
assert.equal(validateRotflAckContext({ ...rotfl, cold_start_readback_ref: 'github-notification:fixture' }).ok, false); checks += 1;
assert.equal(validateRotflAckContext({ ...rotfl, affected_refs: ['work:same'], no_effect_refs: ['work:same'] }).ok, false); checks += 1;

const snapshot = JSON.parse(fs.readFileSync(new URL('../fixtures/baseline/portfolio.synthetic.json', import.meta.url), 'utf8'));
snapshot.baseline_profile = { source_ref: 'fixture:baseline-profile', source_generation: 'fixture:profile-g1' };
for (const repo of snapshot.repositories) repo.baseline_context = {
  profile_ref: snapshot.baseline_profile.source_ref,
  profile_generation: snapshot.baseline_profile.source_generation,
  root_ref: `fixture:root:${repo.repo_ref}`,
  root_generation: 'fixture:root-g1',
};
const baseline = compilePortfolioBaseline(snapshot);
const attached = attachRotflContextToAckSet(compileDistributedAcks(baseline), rotfl);
assert.equal(attached.rotfl_required, true); checks += 1;
assert.equal(attached.acks.length, baseline.repository_denominator); checks += 1;
assert(attached.acks.every(ack => validateRotflAckContext(ack.rotfl).ok)); checks += 1;
assert.throws(() => attachRotflContextToAckSet(compileDistributedAcks(baseline), { ...rotfl, knowledge_return_refs: ['email:fixture'] }), /ROTFL ACK context invalid/); checks += 1;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-rotfl-ack-'));
const baselineFile = path.join(tmp, 'baseline.json');
const rotflFile = path.join(tmp, 'rotfl.json');
const ackFile = path.join(tmp, 'ack.json');
const legacyAckFile = path.join(tmp, 'legacy-ack.json');
fs.writeFileSync(baselineFile, JSON.stringify(baseline));
fs.writeFileSync(rotflFile, JSON.stringify(rotfl));
fs.writeFileSync(ackFile, JSON.stringify({ ...baseAck, rotfl }));
fs.writeFileSync(legacyAckFile, JSON.stringify(baseAck));
const cliPath = new URL('../bin/xi.mjs', import.meta.url).pathname;

const distribute = spawnSync(process.execPath, [cliPath, 'ack', 'distribute', '--baseline', baselineFile, '--rotfl', rotflFile], { encoding: 'utf8' });
assert.equal(distribute.status, 0, distribute.stderr); checks += 1;
const distributed = JSON.parse(distribute.stdout);
assert.equal(distributed.rotfl_required, true); checks += 1;
assert(distributed.acks.every(ack => ack.rotfl?.schema === rotfl.schema)); checks += 1;

const distributeMissing = spawnSync(process.execPath, [cliPath, 'ack', 'distribute', '--baseline', baselineFile], { encoding: 'utf8' });
assert.equal(distributeMissing.status, 2); checks += 1;

const validateCurrent = spawnSync(process.execPath, [cliPath, 'ack', 'validate', '--input', ackFile], { encoding: 'utf8' });
assert.equal(validateCurrent.status, 0, validateCurrent.stderr); checks += 1;
assert.equal(JSON.parse(validateCurrent.stdout).ok, true); checks += 1;
const validateLegacy = spawnSync(process.execPath, [cliPath, 'ack', 'validate', '--input', legacyAckFile], { encoding: 'utf8' });
assert.equal(validateLegacy.status, 0, validateLegacy.stderr); checks += 1;
assert.equal(JSON.parse(validateLegacy.stdout).ok, false); checks += 1;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ mode:'ROTFL_ACK_HOTFIX', checks, result:'PASS', effects:0 }));
