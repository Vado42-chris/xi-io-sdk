#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileMultiThreadWorkProjection } from '../src/projections/multithread-work.mjs';

function lane(overrides = {}) {
  return {
    lane_ref: 'lane:feature',
    root_ref: 'root:studio-monday',
    agent_ref: 'agent:zed-ibal-1',
    work_ref: 'work:feature',
    generation: 'generation:studio-monday',
    state: 'RUNNING',
    attention: true,
    owner_relay_required: false,
    owner_cog_delta: -1,
    bins_uuid: 'bins:uuid-feature',
    resume_prompt_stack_ref: 'prompt:resume-feature',
    persona_card_ref: 'crm:persona-feature',
    brand_profile_ref: 'audhd:brand-xiio',
    ack_ref: 'ack:feature',
    cadence_ref: 'cadence:feature',
    backbeat_ref: 'backbeat:feature',
    result_ref: null,
    return_ref: null,
    apply_return_ref: null,
    meter_ref: 'meter:feature',
    hotfolder_ref: 'hotfolder:feature',
    detonator_ref: 'detonator:feature',
    ...overrides,
  };
}

function base(lanes) {
  return {
    mission_root_ref: 'root:studio-monday',
    generation: 'generation:studio-monday',
    bins_generation: 'bins-generation:42',
    audhd_brand_owner_ref: 'owner:audhd-field-guide',
    ux_owner_ref: 'owner:ux-department',
    crm_profile_owner_ref: 'owner:crm-human-agent-profile',
    subterranean_reap_ref: 'reap:subterranean-42',
    lanes,
  };
}

{
  const out = compileMultiThreadWorkProjection(base([
    lane(),
    lane({ lane_ref:'lane:prototype', agent_ref:'agent:gemini-notebook', work_ref:'work:prototype', attention:false, state:'WAIT', owner_cog_delta:0 }),
    lane({ lane_ref:'lane:customer', agent_ref:'agent:cloud-3', work_ref:'work:customer', attention:true, owner_cog_delta:-1 }),
    lane({ lane_ref:'lane:mcp', agent_ref:'agent:cloud-4', work_ref:'work:mcp', attention:false, state:'DONE', owner_cog_delta:0 }),
    lane({ lane_ref:'lane:evals', agent_ref:'agent:cloud-5', work_ref:'work:evals', attention:true, owner_cog_delta:-1 }),
  ]));
  assert.equal(out.state, 'BORING_MULTI_THREAD_READY');
  assert.equal(out.scorecard.lanes_total, 5);
  assert.equal(out.scorecard.owner_relay_required, 0);
  assert.equal(out.scorecard.cadence_backbeat_gaps, 0);
  assert.equal(out.progressive.attention_frontier.length, 3);
  assert.equal(out.progressive.subterranean.length, 2);
  assert.equal(out.scorecard.owner_cog_delta, -3);
}

{
  const out = compileMultiThreadWorkProjection(base([
    lane({ lane_ref:'lane:stale', generation:'generation:old' }),
    lane({ lane_ref:'lane:relay', agent_ref:'agent:relay', work_ref:'work:relay', owner_relay_required:true, owner_cog_delta:2 }),
    lane({ lane_ref:'lane:backbeat-gap', agent_ref:'agent:gap', work_ref:'work:gap', backbeat_ref:null }),
  ]));
  assert.equal(out.state, 'MULTI_THREAD_GAPS_VISIBLE');
  assert.ok(out.failures.includes('STALE_LANE_GENERATION'));
  assert.ok(out.failures.includes('OWNER_RELAY_REQUIRED'));
  assert.ok(out.failures.includes('CADENCE_BACKBEAT_ASYMMETRY'));
  assert.equal(out.scorecard.owner_relay_required, 1);
  assert.equal(out.scorecard.cadence_backbeat_gaps, 1);
}

{
  const out = compileMultiThreadWorkProjection(base([
    lane({
      lane_ref:'lane:return-gap',
      state:'RETURNED',
      result_ref:'result:1',
      return_ref:null,
      apply_return_ref:null,
    }),
  ]));
  assert.ok(out.failures.includes('RETURN_APPLY_RETURN_GAP'));
  assert.equal(out.scorecard.return_apply_return_gaps, 1);
}

assert.throws(() => compileMultiThreadWorkProjection(base([lane(), lane()])), /DUPLICATE_LANE_REF/);

console.log(JSON.stringify({
  schema: 'xiio.sdk.multithread-work-projection-check/v1',
  result: 'PASS',
  hostiles: 4,
  effects: 0,
  hard: [
    'MULTI_WINDOW_COUNT!=ORCHESTRATION',
    'CADENCE_WITHOUT_BACKBEAT!=COMPLETE',
    'OWNER_RELAY_REQUIRED!=BORING_RUNTIME',
  ],
}, null, 2));
