#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileContinuationDirective, compileRejoinSeams } from '../src/cadence/self-drive.mjs';

const binary = fileURLToPath(new URL('../bin/xi.mjs', import.meta.url));

function invoke(command, input) {
  const run = spawnSync(process.execPath, [binary, 'sdk', 'call', command], {
    input: JSON.stringify({ args: [input] }),
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 2_097_152,
  });
  assert.equal(run.error, undefined);
  assert.equal(run.stderr, '');
  assert.equal(run.status, 0);
  return JSON.parse(run.stdout);
}

const base = {
  root_ref: 'root:rotf-rejoin-canary',
  worker_ref: 'worker:ibal-projection',
  subject_generation: 'g-current',
  current_generation: 'g-current',
  phase_event: 'POST_EFFECT_READBACK',
  pass_state: 'PASS',
  four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
  backlog: [{
    id: 'C010_TWO_WAY_TRANSPORT',
    state: 'TRUE_WAIT',
    priority: 1,
    wake_when: 'receipt:daemon-truth-readback',
  }],
  returns: [],
  residue: [],
  occurrences: [],
  worker_inbox: { ref: 'inbox:worker/ibal-projection', current: true, actionable_count: 0 },
  owner_heartbeat_count: 0,
  seams: [{
    seam_ref: 'C010_TWO_WAY_TRANSPORT',
    kind: 'A2A',
    state: 'TRUE_WAIT',
    priority: 1,
    wake_receipt_ref: 'receipt:daemon-truth-readback',
  }],
  seam_receipts: [{
    receipt_ref: 'receipt:daemon-truth-readback',
    seam_ref: 'C010_TWO_WAY_TRANSPORT',
    root_ref: 'root:rotf-rejoin-canary',
    subject_generation: 'g-current',
    current_generation: 'g-current',
    authenticated: true,
    verified: true,
    provider_readback: true,
  }],
};

let direct = compileContinuationDirective(base);
assert.equal(direct.status, 'FAIL_CURRENT');
assert.equal(direct.stop_class, 'CONTINUE');
assert.equal(direct.yield_allowed, false);
assert.equal(direct.next_packet.action, 'COMPILE_RETURN');
assert.equal(direct.next_packet.seam_ref, 'C010_TWO_WAY_TRANSPORT');
assert.equal(direct.next_packet.receipt_ref, 'receipt:daemon-truth-readback');
assert.equal(direct.rejoin.repaired_stale_wait_count, 1);
assert.equal(direct.cycle.backlog.wait.length, 0);
assert(direct.bugs.includes('STALE_WAIT_AFTER_VERIFIED_RECEIPT'));
assert.equal(direct.next_packet.owner_ingress_required, false);
assert.equal(direct.next_packet.provider_effect, false);

let viaCli = invoke('compileContinuationDirective', base);
assert.equal(viaCli.provider_effect, false);
assert.deepEqual(viaCli.result, direct);

const rejoinViaCli = invoke('compileRejoinSeams', base);
assert.equal(rejoinViaCli.result.next_action.action, 'COMPILE_RETURN');
assert.equal(rejoinViaCli.result.authority_granted, false);
assert.equal(rejoinViaCli.result.provider_effect, false);

direct = compileContinuationDirective({
  ...base,
  seam_receipts: [{ ...base.seam_receipts[0], return_ref: 'return:c010' }],
});
assert.equal(direct.next_packet.action, 'APPLY_RETURN');
assert.equal(direct.next_packet.return_ref, 'return:c010');

direct = compileContinuationDirective({
  ...base,
  seam_receipts: [{ ...base.seam_receipts[0], return_ref: 'return:c010', return_applied: true }],
});
assert.equal(direct.next_packet.action, 'VERIFY_CONSUMER_READBACK');

direct = compileContinuationDirective({
  ...base,
  seam_receipts: [{
    ...base.seam_receipts[0],
    return_ref: 'return:c010',
    return_applied: true,
    consumer_readback: true,
  }],
});
assert.equal(direct.status, 'CURRENT');
assert.equal(direct.stop_class, 'TERMINAL');
assert.equal(direct.rejoin.next_action, null);

direct = compileContinuationDirective({
  ...base,
  seam_receipts: [{ ...base.seam_receipts[0], current_generation: 'g-stale' }],
});
assert.equal(direct.stop_class, 'TRUE_WAIT');
assert.equal(direct.rejoin.satisfied_seam_refs.length, 0);

direct = compileContinuationDirective({
  ...base,
  seam_receipts: [{ ...base.seam_receipts[0], authenticated: false, verified: false }],
});
assert.equal(direct.stop_class, 'CONTINUE');
assert.equal(direct.next_packet.action, 'VERIFY_SEAM_RECEIPT');
assert.equal(direct.rejoin.satisfied_seam_refs.length, 0);
assert.equal(direct.next_packet.owner_ingress_required, false);

const multi = {
  ...base,
  backlog: [
    { id: 'ACK_SEAM', state: 'TRUE_WAIT', priority: 3, wake_when: 'receipt:ack' },
    { id: 'A2A_SEAM', state: 'TRUE_WAIT', priority: 2, wake_when: 'receipt:a2a' },
    { id: 'MCP_SEAM', state: 'BLOCKED', priority: 1, machine_resolvable: true },
  ],
  seams: [
    { seam_ref: 'ACK_SEAM', kind: 'ACK', state: 'TRUE_WAIT', priority: 3, wake_receipt_ref: 'receipt:ack' },
    { seam_ref: 'A2A_SEAM', kind: 'A2A', state: 'TRUE_WAIT', priority: 2, wake_receipt_ref: 'receipt:a2a' },
    { seam_ref: 'MCP_SEAM', kind: 'MCP', state: 'BLOCKED', priority: 1, machine_resolvable: true },
  ],
  seam_receipts: [{
    receipt_ref: 'receipt:a2a',
    seam_ref: 'A2A_SEAM',
    root_ref: base.root_ref,
    subject_generation: base.subject_generation,
    current_generation: base.current_generation,
    authenticated: true,
    verified: true,
    provider_readback: true,
    return_ref: 'return:a2a',
    return_applied: true,
    consumer_readback: true,
  }],
};
direct = compileContinuationDirective(multi);
assert.equal(direct.stop_class, 'CONTINUE');
assert.equal(direct.next_packet.action, 'RESOLVE_SEAM');
assert.equal(direct.next_packet.seam_ref, 'MCP_SEAM');
assert.deepEqual(direct.rejoin.current_seam_refs, ['A2A_SEAM']);
assert(direct.rejoin.unresolved_seam_refs.includes('ACK_SEAM'));
assert(direct.rejoin.unresolved_seam_refs.includes('MCP_SEAM'));
assert.equal(direct.owner_heartbeat_bug, false);

// CRM dogfood: local structure is not peer connection. A structurally valid local
// ACK that is unauthenticated and lacks provider readback must remain unqualified.
const xib14Root = 'linear:XIB-14:23378e84-ce46-47d6-ac08-4569a317aa75';
const connectionProbe = {
  ...base,
  root_ref: xib14Root,
  backlog: [
    { id: 'PEER_ACK', state: 'TRUE_WAIT', priority: 1, wake_when: 'receipt:local-structural-ack' },
    { id: 'SMTP_EGRESS', state: 'TRUE_WAIT', priority: 2, wake_when: 'receipt:smtp-provider-readback' },
  ],
  seams: [
    { seam_ref: 'PEER_ACK', kind: 'ACK', state: 'TRUE_WAIT', priority: 1, wake_receipt_ref: 'receipt:local-structural-ack' },
    { seam_ref: 'SMTP_EGRESS', kind: 'SMTP', state: 'TRUE_WAIT', priority: 2, wake_receipt_ref: 'receipt:smtp-provider-readback' },
  ],
  seam_receipts: [{
    receipt_ref: 'receipt:local-structural-ack',
    seam_ref: 'PEER_ACK',
    root_ref: xib14Root,
    subject_generation: base.subject_generation,
    current_generation: base.current_generation,
    authenticated: false,
    verified: true,
    provider_readback: false,
  }],
};
direct = compileContinuationDirective(connectionProbe);
assert.equal(direct.stop_class, 'CONTINUE');
assert.equal(direct.next_packet.action, 'VERIFY_SEAM_RECEIPT');
assert.equal(direct.next_packet.seam_ref, 'PEER_ACK');
assert.equal(direct.rejoin.satisfied_seam_refs.length, 0);
assert(direct.rejoin.unresolved_seam_refs.includes('SMTP_EGRESS'));
assert.equal(direct.next_packet.owner_ingress_required, false);

// External/provider occurrence identity cannot satisfy an internal-root seam even
// when its transport flags are otherwise green.
direct = compileContinuationDirective({
  ...connectionProbe,
  seam_receipts: [{
    receipt_ref: 'receipt:local-structural-ack',
    seam_ref: 'PEER_ACK',
    root_ref: 'slack:external-occurrence-only',
    subject_generation: base.subject_generation,
    current_generation: base.current_generation,
    authenticated: true,
    verified: true,
    provider_readback: true,
  }],
});
assert.equal(direct.rejoin.satisfied_seam_refs.length, 0);
assert.equal(direct.stop_class, 'TRUE_WAIT');

console.log(JSON.stringify({
  status: 'PASS',
  regression: 'STALE_WAIT_AFTER_VERIFIED_RECEIPT',
  seam_families: ['ACK', 'A2A', 'MCP', 'SMTP'],
  connection_dimensions: ['INTERNAL_IDENTITY', 'LOCAL_STRUCTURE', 'PEER_TRANSPORT', 'EGRESS_AUTHORITY', 'CONSUMER_READBACK'],
  verified_rejoin_stages: ['COMPILE_RETURN', 'APPLY_RETURN', 'VERIFY_CONSUMER_READBACK', 'TERMINAL_AFTER_READBACK'],
  hostile_cases: 6,
  owner_heartbeats: 0,
  provider_effects: 0,
}));
