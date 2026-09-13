#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileInteractionLifecycle } from '../src/cadence/interaction-lifecycle.mjs';

const fixturePath = fileURLToPath(new URL('../fixtures/cadence/interaction-lifecycle-known-answer.v1.json', import.meta.url));
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const close = {
  result_ref: 'result:machine-next-hostile',
  burndown_receipt_ref: 'receipt:burndown:machine-next-hostile',
  denominator_delta_ref: 'receipt:delta:machine-next-hostile',
  verification_refs: ['receipt:verify:machine-next-hostile'],
  failure_refs: [],
  thrash_refs: [],
  learning_refs: ['lesson:root-stop-flatplane'],
  owner_load_ref: 'receipt:owner-load:machine-next-hostile',
  remaining_red_refs: [],
  terminal_ref: 'terminal:local-interaction-only',
  return_ref: 'return:machine-next-hostile',
  apply_return_ref: 'apply:machine-next-hostile',
  reap_ref: 'reap:machine-next-hostile',
  rejoin_ref: 'rejoin:machine-next-hostile',
  current_readback_ref: 'readback:machine-next-hostile',
};

const result = compileInteractionLifecycle({
  ...structuredClone(fixture.interaction),
  machine_resolvable_next: true,
  owner_heartbeat_count: 0,
  close,
});

assert.equal(result.status, 'CLOSED_CURRENT');
assert.equal(result.close_state, 'CLOSED');
assert.equal(result.machine_resolvable_next, true);
assert.equal(result.root_stop_allowed, false);
assert.equal(result.next_action, 'CONTINUE_MACHINE_RESOLVABLE_NEXT');
assert.equal(result.provider_effect, false);
assert.equal(result.authority_granted, false);
assert(result.hard.includes('MACHINE_RESOLVABLE_NEXT -> ROOT_STOP_FALSE'));

console.log(JSON.stringify({
  status: 'PASS',
  hostile: 'CLOSED_INTERACTION_WITH_MACHINE_RESOLVABLE_NEXT',
  interaction_closed: true,
  root_stop_allowed: result.root_stop_allowed,
  next_action: result.next_action,
  owner_heartbeat_count: result.owner_heartbeat_count,
  provider_effects: 0,
}));
