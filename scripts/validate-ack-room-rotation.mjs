import assert from 'node:assert/strict';
import { compileLocalAckFirstPreflight } from '../src/acks/local-first.mjs';
import { compileAckRoomRotation, rotateAckRoom } from '../src/acks/room-rotation.mjs';

const local = compileLocalAckFirstPreflight({
  localRuntime: 'RUNNING', localAck: 'ACKED', localSimulation: 'SIM_PASS', crmCurrent: true, hvtSelected: true,
  remoteExecutorState: 'BLOCKED_PROVIDER_BILLING',
});
assert.equal(local.status, 'LOCAL_READY');
assert.equal(local.remote_executor_eligible, false);
assert.equal(local.owner_relay_required, false);

const rooms = [
  { ref: 'room:primitive', role: 'SDK', detail: 'shared primitive/ACK semantics' },
  { ref: 'room:human', role: 'Inbox', detail: 'owner-visible dev dogfood' },
  { ref: 'room:delivery', role: 'Switchboard', detail: 'route/admit/verify/return' },
];
const first = compileAckRoomRotation({
  root_ref: 'MONDAY-ROTFL-PRODUCT-PROOF-001', work_ref: 'INBOX-DEV-DOGFOOD-001', baseline_generation: 'g0', subject_generation: 'g1',
  rooms, room_index: 0, first_red: 'INBOX_DEV_RUNTIME_READBACK_UNPROVEN', effect_ceiling: 'NO_EFFECT',
  return_target_ref: 'return:studio-launch', evidence_refs: ['sdk:local-first','inbox:crm','framework:dev'],
  next_machine_action: local.next, byte_budget: 2048,
});
assert.equal(first.ack_state, 'ACK');
assert.equal(first.attempt, 0);
assert.equal(first.prove, false);
assert.equal(first.authority_granted, false);
assert.equal(first.room.ref, 'room:primitive');
assert.equal(first.next_room_ref, 'room:human');
assert.equal(first.within_budget, true);
assert(first.encoded_bytes <= 2048);
assert.equal(first.metering.rebuild_full_context, false);

const second = rotateAckRoom(first, { rooms, subject_generation: 'g2', first_red: 'OWNER_VISIBLE_READBACK_UNPROVEN', next_machine_action: 'READ_INBOX_DEV_SURFACE' });
assert.equal(second.room.ref, 'room:human');
assert.equal(second.attempt, 0);
assert.equal(second.prove, false);
console.log('ACK_ROOM_ROTATION=PASS local_ack_consumed=1 full_history_rebuild=0');
