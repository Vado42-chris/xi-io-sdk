#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './validate-self-drive-continuation.mjs';
import { compileContinuationCycle } from '../src/cadence/continuation.mjs';
import { compileWorkerAdapterConformance, WORKER_ADAPTER_REQUIRED_BINDINGS } from '../src/worker/lifecycle.mjs';
import { commandCatalog } from '../src/lexicon/baseline-commands.mjs';

const base = () => ({
  root_ref: 'root:G193',
  worker_ref: 'worker:chatgpt',
  subject_generation: 'g2',
  current_generation: 'g2',
  phase_event: 'POST_RESULT',
  pass_state: 'PASS',
  four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
  backlog: [],
  returns: [],
  residue: [],
  occurrences: [],
  worker_inbox: { ref: 'inbox:worker/chatgpt', current: true, actionable_count: 0 },
  async_continuation_required: true,
});

const test = (name, fn) => {
  fn();
  process.stdout.write(`PASS ${name}\n`);
};

test('PASS_WITH_RUNNABLE_BACKLOG_CONTINUES', () => {
  const input = base();
  input.backlog = [{ id: 'work:next', state: 'RUNNABLE', priority: 1 }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'CONTINUE_WORK');
  assert.equal(result.terminal, false);
  assert(result.next_actions.includes('CONTINUE_NEXT_GOLDEN_WORK'));
});

test('PASS_WITH_STRANDED_RESULT_EATS_BEFORE_STOP', () => {
  const input = base();
  input.returns = [{ id: 'result:1', state: 'RESULT', returned: false }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'EAT_REQUIRED');
  assert.deepEqual(result.returns.stranded, ['result:1']);
});


test('RETURNED_RESULT_WITHOUT_RECEIVING_APPLY_CANNOT_CLOSE_CADENCE', () => {
  for (const applied of [undefined, false, null]) {
    const input = base();
    input.returns = [{ id: 'result:sent', state: 'RESULT', returned: true, applied }];
    const result = compileContinuationCycle(input);
    assert.equal(result.terminal, false);
    assert.equal(result.disposition, 'EAT_REQUIRED');
    assert.deepEqual(result.returns.results, ['result:sent']);
    assert.deepEqual(result.returns.stranded, ['result:sent']);
  }
});

test('PASS_WITH_REAPER_RESIDUE_REAPS', () => {
  const input = base();
  input.residue = [{ id: 'ghost:1', class: 'ORPHANED_NEXT' }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'REAP_REQUIRED');
  assert.equal(result.reap_required, true);
});

test('STALE_GENERATION_REBASES_FIRST', () => {
  const input = base();
  input.subject_generation = 'g1';
  input.backlog = [{ id: 'work:next', state: 'RUNNABLE', priority: 1 }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'REBASE_REQUIRED');
  assert.equal(result.rebase_required, true);
  assert.equal(result.next_actions[0], 'REBASE');
});

test('BLOCKED_CELL_DOES_NOT_STOP_RUNNABLE_SIBLING', () => {
  const input = base();
  input.backlog = [
    { id: 'work:blocked', state: 'BLOCKED', priority: 1 },
    { id: 'work:runnable', state: 'RUNNABLE', priority: 2 },
  ];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'CONTINUE_WORK');
  assert.equal(result.backlog.blocked.length, 1);
  assert.equal(result.backlog.runnable.length, 1);
});

test('TRUE_WAIT_DOES_NOT_STOP_RUNNABLE_SIBLING', () => {
  const input = base();
  input.backlog = [
    { id: 'work:wait', state: 'TRUE_WAIT', priority: 1 },
    { id: 'work:runnable', state: 'ACTIVE_ELIGIBLE', priority: 2 },
  ];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'CONTINUE_WORK');
});

test('MISSING_ASYNC_WORKER_INBOX_BLOCKS_TERMINAL_ONLY_AFTER_QUEUE_EMPTY', () => {
  const input = base();
  input.worker_inbox = { ref: null, current: false, actionable_count: 0 };
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'WAIT_WORKER_INBOX_BINDING');
  assert.equal(result.worker_inbox.gap, true);
});

test('FOUR_SCALE_CURRENT_ZERO_REMAINDER_IS_TERMINAL_FIXED_POINT', () => {
  const result = compileContinuationCycle(base());
  assert.equal(result.disposition, 'TERMINAL_FIXED_POINT');
  assert.equal(result.terminal, true);
  assert.equal(result.four_scale_current, true);
});

test('UNKNOWN_BACKLOG_FAILS_CLOSED', () => {
  const input = base();
  input.backlog = [{ id: 'work:unknown', state: 'UNKNOWN' }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'WAIT_CURRENTNESS');
  assert.equal(result.backlog.unknown.length, 1);
});

test('ACTIONABLE_INTERNAL_INBOX_IS_WORK_TO_EAT', () => {
  const input = base();
  input.worker_inbox.actionable_count = 2;
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'EAT_REQUIRED');
  assert.equal(result.worker_inbox.actionable_count, 2);
});

const verifiedAppliedReturn = (overrides = {}) => ({
  id: 'apply:1',
  state: 'APPLY_RETURN',
  applied: true,
  result_ref: 'result:1',
  return_ref: 'return:1',
  apply_return_ref: 'apply-return:1',
  readback_ref: 'readback:1',
  consumer_ref: 'consumer:1',
  ...overrides,
});

test('APPLIED_RETURN_WITH_COMPLETE_RETURN_AND_READBACK_COORDINATES_IS_NOT_STRANDED', () => {
  const input = base();
  input.returns = [verifiedAppliedReturn()];
  const result = compileContinuationCycle(input);
  assert.equal(result.returns.stranded.length, 0);
  assert.deepEqual(result.returns.applied, ['apply:1']);
  assert.equal(result.disposition, 'TERMINAL_FIXED_POINT');
});


test('UNCONFIRMED_OR_INCOMPLETE_APPLY_RETURN_CANNOT_LAUNDER_TERMINAL_CLOSURE', () => {
  const hostiles = [
    { applied: false },
    { applied: undefined },
    { applied: null },
    { result_ref: null },
    { return_ref: null },
    { apply_return_ref: null },
    { readback_ref: null },
    { consumer_ref: null },
  ];
  for (const patch of hostiles) {
    const input = base();
    input.returns = [verifiedAppliedReturn({ id: 'apply:unverified', ...patch })];
    const result = compileContinuationCycle(input);
    assert.equal(result.terminal, false);
    assert.equal(result.disposition, 'EAT_REQUIRED');
    assert.deepEqual(result.returns.applied, []);
    assert.deepEqual(result.returns.stranded, ['apply:unverified']);
  }
});



test('RETURNED_RESULT_STAYS_STRANDED_WITHOUT_EXACT_PHASE10_COORDINATES', () => {
  const input = base();
  input.returns = [{
    id:'result:sent',state:'RESULT',returned:true,applied:true,
    result_ref:'result:1',return_ref:'return:1',
    apply_return_ref:'apply-return:1',readback_ref:null,consumer_ref:'consumer:1',
  }];
  const result=compileContinuationCycle(input);
  assert.equal(result.disposition,'EAT_REQUIRED');
  assert.deepEqual(result.returns.stranded,['result:sent']);
});

test('RETURN_STATE_WITH_APPLIED_LABEL_STAYS_STRANDED_WITHOUT_READBACK', () => {
  const input=base();
  input.returns=[{
    id:'return:sent',state:'RETURN',applied:true,
    result_ref:'result:1',return_ref:'return:1',
    apply_return_ref:'apply-return:1',readback_ref:null,consumer_ref:'consumer:1',
  }];
  const result=compileContinuationCycle(input);
  assert.equal(result.disposition,'EAT_REQUIRED');
  assert.deepEqual(result.returns.stranded,['return:sent']);
});



test('CONTINUATION_COORDINATES_DO_NOT_OVERRIDE_MISSING_LIFECYCLE_RETURN_OR_READBACK_EVIDENCE', () => {
  const input=base();
  input.returns=[verifiedAppliedReturn()];
  const continuation=compileContinuationCycle(input);
  assert.equal(continuation.disposition,'TERMINAL_FIXED_POINT');

  const bindings=Object.fromEntries(WORKER_ADAPTER_REQUIRED_BINDINGS.map(id=>[
    id,{verified:true,evidence_ref:'evidence:'+id}
  ]));
  bindings.work_generation={...bindings.work_generation,work_ref:'work:one',generation_ref:'generation:one'};
  bindings.currentness_recovery={...bindings.currentness_recovery,currentness_ref:'currentness:one',recovery_ref:'recovery:one',hallberg_recovery_ref:'hallberg:one',lifecycle_selected:true,ordinary_work_covered:true};
  bindings.admission={...bindings.admission,assignment_ref:'assignment:one',principal_ref:'principal:one',admission_ref:'admission:one',current:true};
  bindings.tool_capability={...bindings.tool_capability,capability_ref:'capability:one',tool_catalog_ref:'tools:one',qualified:true,current:true};
  bindings.ack={...bindings.ack,ack_ref:'ack:one',sow_ref:'sow:one'};
  bindings.privacy_effect={...bindings.privacy_effect,privacy_ref:'privacy:one',effect_ceiling:'READ_ONLY'};
  bindings.bounded_execution={...bindings.bounded_execution,attempt_ref:'attempt:one',execution_ref:'execution:one',bounded:true};
  bindings.yar={...bindings.yar,yar_ref:'yar:one',interrupted_return_reconciled:true};
  bindings.result_return={verified:false,evidence_ref:null};
  bindings.verified_readback={verified:false,evidence_ref:null};
  bindings.affected_recompile={...bindings.affected_recompile,affected_set_ref:'affected:one',recompile_ref:'recompile:one',all_and_only:true};
  bindings.restart_reconciliation={...bindings.restart_reconciliation,coverage_ref:'restart:one',covered_boundaries:['RECOVERY','ADMISSION','EXECUTION','YAR','APPLY_RETURN','READBACK']};
  bindings.qualification_independence={...bindings.qualification_independence,domains:Object.fromEntries(['recovery_wake','admission','affected_return'].map(domain=>[domain,{
    execution_ref:'execution:'+domain,hostile_ref:'hostile:'+domain,independent_review_ref:'review:'+domain,
    executor_principal_ref:'executor:'+domain,hostile_principal_ref:'hostile-principal:'+domain,reviewer_principal_ref:'reviewer:'+domain
  }]))};
  bindings.installed_consumer={...bindings.installed_consumer,installed_generation:'source:g1',lifecycle_generation:'lifecycle:g1'};

  const conformance=compileWorkerAdapterConformance({
    adapter_id:'adapter:test',
    adapter_kind:'test',
    source_generation:'source:g1',
    installed_generation:'source:g1',
    lifecycle_generation:'lifecycle:g1',
    bindings,
  });
  assert.equal(conformance.supplied_complete,false);
  assert.equal(conformance.cells.find(x=>x.id==='result_return').state,'UNVERIFIED');
  assert.equal(conformance.cells.find(x=>x.id==='verified_readback').state,'UNVERIFIED');
  assert.equal(conformance.runtime_complete,false);
  assert.equal(conformance.release_eligible,false);
});

test('PASS_ALONE_WITH_NONCURRENT_100S_DOES_NOT_STOP', () => {
  const input = base();
  input.four_scale.MACRO = 'NOT_100';
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'CONTINUE_QUALIFICATION');
  assert.equal(result.terminal, false);
});

test('UNCONSUMED_OCCURRENCE_IS_EAT_REQUIRED', () => {
  const input = base();
  input.occurrences = [{ id: 'occurrence:new', consumed: false }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'EAT_REQUIRED');
  assert.deepEqual(result.occurrences.unconsumed, ['occurrence:new']);
});

test('UNKNOWN_REAP_CLASS_CANNOT_BE_SILENTLY_REAPED', () => {
  const input = base();
  input.residue = [{ id: 'mystery:1', class: 'SOMETHING_NEW' }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'WAIT_CURRENTNESS');
  assert.equal(result.residue.findings.length, 0);
  assert.equal(result.residue.unknown.length, 1);
});

test('TRUE_WAIT_ONLY_IS_TYPED_WAIT_NOT_TERMINAL', () => {
  const input = base();
  input.backlog = [{ id: 'provider:wait', state: 'TRUE_WAIT' }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'WAIT_TRUE_GATE');
  assert.equal(result.terminal, false);
});

test('INVALID_PHASE_EVENT_REJECTS', () => {
  const input = base();
  input.phase_event = 'WHATEVER';
  assert.throws(() => compileContinuationCycle(input), /INVALID_INPUT/);
});

test('BABYSIT_LEXICON_ALIASES_ONE_CONTINUATION_OWNER', () => {
  const cadence = commandCatalog().commands.find((entry) => entry.id === 'cadence.continue');
  assert(cadence, 'cadence.continue lexicon entry missing');
  for (const alias of ['babysit', '/babysit', '@babysit']) assert(cadence.aliases.includes(alias));
  assert(cadence.hashtags.includes('#babysit'));
  assert.equal(cadence.effect, 'PROJECTION_ONLY');
});

test('DIRECT_XI_CADENCE_CONTINUE_MATCHES_CALLABLE', () => {
  const binary = fileURLToPath(new URL('../bin/xi.mjs', import.meta.url));
  const fixturePath = fileURLToPath(new URL('../fixtures/cadence/continuation.synthetic.json', import.meta.url));
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const run = spawnSync(process.execPath, [binary, 'cadence', 'continue', '--input', fixturePath], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.deepEqual(JSON.parse(run.stdout), compileContinuationCycle(fixture));
  assert.equal(JSON.parse(run.stdout).disposition, 'CONTINUE_WORK');
});

console.log(JSON.stringify({
  status: 'PASS',
  cases: 24,
  self_drive_cases: 12,
  effects: 0,
  terminal_requires_four_scale_current: true,
  pass_does_not_stop: true,
  reap_eat_backlog_refresh: true,
  worker_inbox_authority: false,
  dynamic_babysit_alias: true,
  direct_cli: true
}));
