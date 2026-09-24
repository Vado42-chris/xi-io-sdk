#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runBabysitHost } from '../src/cadence/babysit-host.mjs';

const base = () => ({
  root_ref: 'root:babysit-host',
  worker_ref: 'worker:host',
  subject_generation: 'g1',
  current_generation: 'g1',
  phase_event: 'POST_RESULT',
  pass_state: 'PASS',
  four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
  backlog: [],
  returns: [],
  residue: [],
  occurrences: [],
  seams: [],
  seam_receipts: [],
  external_edges: [
    { id: 'email:ingress', kind: 'INGRESS', state: 'PASS', applicable: true },
    { id: 'email:egress', kind: 'EGRESS', state: 'PASS', applicable: true },
    { id: 'google:drive', kind: 'PROJECTION', state: 'PASS', applicable: true },
    { id: 'loki:cloud', kind: 'PROJECTION', state: 'PASS', applicable: true },
  ],
  worker_inbox: { ref: 'inbox:worker/host', current: true, actionable_count: 0 },
  async_continuation_required: true,
  owner_heartbeat_count: 0,
});

const test = async (name, fn) => {
  await fn();
  process.stdout.write('PASS ' + name + '\n');
};

await test('TEN_RUNNABLE_INCREMENTS_ARE_BABYSAT_TO_TERMINAL', async () => {
  const initial = base();
  initial.backlog = Array.from({ length: 10 }, (_, index) => ({
    id: 'W' + String(index + 1).padStart(2, '0'),
    state: 'RUNNABLE',
    priority: index + 1,
  }));
  const result = await runBabysitHost({
    initial_state: initial,
    max_iterations: 20,
    reduce_ten:()=>({collapse_to_1:true,hotpatch_required:false}),
    step: ({ state, packet }) => ({
      ...state,
      backlog: state.backlog.map((item) => item.id === packet.work_ref ? { ...item, state: 'DONE' } : item),
    }),
  });
  assert.equal(result.loop_state, 'TERMINAL');
  assert.equal(result.adapter_calls, 10);
  assert.equal(result.directive_count, 11);
  assert.equal(result.yield_allowed, true);
  assert.equal(result.terminal, true);
  assert.equal(result.ten_receipts.length,1);
  assert.equal(result.ten_receipts[0].collapse_to_1,true);
});

await test('ELEVENTH_STEP_REQUIRES_TEN_REDUCER', async () => {
  const initial = base();
  initial.backlog = Array.from({ length: 11 }, (_, index) => ({ id:'T'+(index+1), state:'RUNNABLE', priority:index+1 }));
  await assert.rejects(() => runBabysitHost({
    initial_state: initial,
    max_iterations: 20,
    step: ({state,packet}) => ({...state,backlog:state.backlog.map((item)=>item.id===packet.work_ref?{...item,state:'DONE'}:item)}),
  }), /BABYSIT_TEN_REDUCER_REQUIRED/);
});

await test('TEN_PRESSURE_HOTPATCH_THEN_COLLAPSE_CONTINUES', async () => {
  const initial=base();
  initial.backlog=Array.from({length:11},(_,index)=>({id:'P'+(index+1),state:'RUNNABLE',priority:index+1}));
  let reduced=0, patched=0;
  const result=await runBabysitHost({
    initial_state:initial,
    max_iterations:30,
    reduce_ten:({after_hotpatch})=>{
      reduced++;
      return after_hotpatch?{collapse_to_1:true,hotpatch_required:false}:{collapse_to_1:false,hotpatch_required:true,pressure:['latency']};
    },
    hotpatch:({state})=>{patched++;return {state,receipt:{state:'APPLIED',kind:'LATENCY_PRESSURE'}};},
    step:({state,packet})=>({...state,backlog:state.backlog.map((item)=>item.id===packet.work_ref?{...item,state:'DONE'}:item)}),
  });
  assert.equal(result.terminal,true);
  assert.equal(reduced,2);
  assert.equal(patched,1);
  assert.equal(result.hotpatch_receipts.length,1);
});

await test('TEMPORAL_REBASE_AND_METER_RUN_EVERY_ITERATION', async () => {
  const initial=base();
  initial.backlog=[{id:'R1',state:'RUNNABLE',priority:1}];
  let tick=0;
  const result=await runBabysitHost({
    initial_state:initial,
    require_temporal_rebase:true,
    rebase:({state})=>{
      tick++;
      return {state,observed_at:new Date(Date.UTC(2026,8,21,12,40,tick)).toISOString(),deadline_at:'2026-09-21T14:00:00.000Z',remaining_ms:4_000_000,meter_required:true,meter_state:'SIM',billing_mode:'SIM'};
    },
    step:({state,packet})=>({...state,backlog:state.backlog.map((item)=>item.id===packet.work_ref?{...item,state:'DONE'}:item)}),
  });
  assert.equal(result.terminal,true);
  assert.equal(result.temporal_rebase_count,2);
  assert.equal(result.temporal_rebases.every((x)=>x.meter_state==='SIM'),true);
});

await test('TEMPORAL_REBASE_REQUIRED_FAILS_WITHOUT_ADAPTER', async () => {
  const initial=base();
  await assert.rejects(()=>runBabysitHost({initial_state:initial,require_temporal_rebase:true,step:async({state})=>state}),/BABYSIT_TEMPORAL_REBASE_ADAPTER_REQUIRED/);
});

await test('TRUE_WAIT_YIELDS_WITHOUT_HOST_STEP', async () => {
  const initial = base();
  initial.backlog = [{ id: 'provider', state: 'TRUE_WAIT', wake_when: 'provider://return/1' }];
  let calls = 0;
  const result = await runBabysitHost({
    initial_state: initial,
    step: async () => { calls += 1; return initial; },
  });
  assert.equal(result.loop_state, 'TRUE_WAIT');
  assert.equal(calls, 0);
  assert.equal(result.adapter_calls, 0);
});

await test('RUNNABLE_REQUIRES_HOST_ADAPTER', async () => {
  const initial = base();
  initial.backlog = [{ id: 'W1', state: 'RUNNABLE', priority: 1 }];
  await assert.rejects(() => runBabysitHost({ initial_state: initial }), /BABYSIT_HOST_ADAPTER_REQUIRED/);
});

await test('UNCHANGED_RUNNABLE_STATE_FAILS_CLOSED', async () => {
  const initial = base();
  initial.backlog = [{ id: 'W1', state: 'RUNNABLE', priority: 1 }];
  await assert.rejects(() => runBabysitHost({
    initial_state: initial,
    stall_limit: 2,
    step: ({ state }) => state,
  }), /BABYSIT_STALLED_STATE/);
});

await test('OWNER_HEARTBEAT_BUG_DOES_NOT_STOP_MACHINE_WORK', async () => {
  const initial = base();
  initial.owner_heartbeat_count = 1;
  initial.backlog = [{ id: 'W1', state: 'RUNNABLE', priority: 1 }];
  const result = await runBabysitHost({
    initial_state: initial,
    step: ({ state, packet }) => ({
      ...state,
      backlog: state.backlog.map((item) => item.id === packet.work_ref ? { ...item, state: 'DONE' } : item),
      owner_heartbeat_count: 0,
    }),
  });
  assert.equal(result.loop_state, 'TERMINAL');
  assert.equal(result.adapter_calls, 1);
  assert(result.bugs.includes('OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT'));
  assert.equal(result.status, 'FAIL_CURRENT');
});

await test('MAX_ITERATIONS_NEVER_LAUNDERS_TERMINAL', async () => {
  const initial = base();
  initial.backlog = [
    { id: 'W1', state: 'RUNNABLE', priority: 1 },
    { id: 'W2', state: 'RUNNABLE', priority: 2 },
  ];
  await assert.rejects(() => runBabysitHost({
    initial_state: initial,
    max_iterations: 1,
    step: ({ state, packet }) => ({
      ...state,
      backlog: state.backlog.map((item) => item.id === packet.work_ref ? { ...item, state: 'DONE' } : item),
    }),
  }), /BABYSIT_MAX_ITERATIONS_WITHOUT_ALLOWED_STOP/);
});

await test('ADAPTER_FAILURE_IS_TYPED', async () => {
  const initial = base();
  initial.backlog = [{ id: 'W1', state: 'RUNNABLE', priority: 1 }];
  await assert.rejects(() => runBabysitHost({
    initial_state: initial,
    step: async () => { throw new Error('boom'); },
  }), /BABYSIT_HOST_ADAPTER_ERROR:boom/);
});

await test('INVALID_ADAPTER_STATE_FAILS_CLOSED', async () => {
  const initial = base();
  initial.backlog = [{ id: 'W1', state: 'RUNNABLE', priority: 1 }];
  await assert.rejects(() => runBabysitHost({
    initial_state: initial,
    step: async () => null,
  }), /BABYSIT_HOST_ADAPTER_STATE_INVALID/);
});

await test('TEN_CONSECUTIVE_BABYSIT_RUNS_REACH_TERMINAL', async () => {
  for (let run = 1; run <= 10; run += 1) {
    const initial = base();
    initial.backlog = Array.from({ length: 3 }, (_, index) => ({
      id: 'R' + run + '-W' + (index + 1),
      state: 'RUNNABLE',
      priority: index + 1,
    }));
    const result = await runBabysitHost({
      initial_state: initial,
      max_iterations: 10,
      step: ({ state, packet }) => ({
        ...state,
        backlog: state.backlog.map((item) => item.id === packet.work_ref ? { ...item, state: 'DONE' } : item),
      }),
    });
    assert.equal(result.loop_state, 'TERMINAL');
    assert.equal(result.adapter_calls, 3);
    assert.equal(result.terminal, true);
  }
});

console.log(JSON.stringify({
  status: 'PASS',
  cases: 13,
  ten_consecutive_runs: true,
  ten_increment_babysit: true,
  host_continue_is_executed: true,
  allowed_stops: ['TRUE_WAIT', 'OWNER_ONLY', 'TERMINAL'],
  effects: 0,
}));
