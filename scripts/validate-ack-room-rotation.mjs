import assert from 'node:assert/strict';
import { compileLocalAckFirstPreflight } from '../src/acks/local-first.mjs';
import { compileAckRoomRotation, rotateAckRoom } from '../src/acks/room-rotation.mjs';

const local = compileLocalAckFirstPreflight({
  localRuntime: 'RUNNING',
  localAck: 'ACKED',
  localSimulation: 'SIM_PASS',
  localExecutor: 'ZED_ACP_OLLAMA',
  localExecutorReadback: 'PASS',
  cordFree: true,
  ownerPathIndependent: true,
  automaticCloudFallback: false,
  crmCurrent: true,
  hvtSelected: true,
  remoteExecutorState: 'BLOCKED_PROVIDER_BILLING',
});
assert.equal(local.status, 'LOCAL_READY');
assert.equal(local.local_executor, 'ZED_ACP_OLLAMA');
assert.equal(local.cord_free, true);
assert.equal(local.owner_path_independent, true);
assert.equal(local.automatic_cloud_fallback, false);
assert.equal(local.remote_executor_eligible, false);
assert.equal(local.owner_relay_required, false);

const rooms = [
  { ref: 'room:primitive', role: 'SDK', detail: 'shared primitive/ACK semantics' },
  { ref: 'room:human', role: 'Inbox', detail: 'owner-visible dev dogfood' },
  { ref: 'room:delivery', role: 'Switchboard', detail: 'route/admit/verify/return' },
];
const knowledgeRefs = [
  'inbox:institutional-knowledge-closure@3daf98e9',
  'crm-reference:samlaw:LOOP_RETURNS',
  'dataforge:Simulation_Lessons',
];
const first = compileAckRoomRotation({
  root_ref: 'MONDAY-ROTFL-PRODUCT-PROOF-001', work_ref: 'INBOX-DEV-DOGFOOD-001', baseline_generation: 'g0', subject_generation: 'g1',
  rooms, room_index: 0, first_red: 'INBOX_DEV_RUNTIME_READBACK_UNPROVEN', effect_ceiling: 'NO_EFFECT',
  return_target_ref: 'return:studio-launch', evidence_refs: ['sdk:local-first','inbox:crm','framework:dev'],
  institutional_knowledge_required: true,
  institutional_knowledge_current: true,
  institutional_knowledge_refs: knowledgeRefs,
  institutional_knowledge_runtime_state: 'WAIT_RUNTIME',
  next_machine_action: local.next, byte_budget: 3072,
});
assert.equal(first.ack_state, 'ACK');
assert.equal(first.attempt, 0);
assert.equal(first.prove, false);
assert.equal(first.authority_granted, false);
assert.equal(first.room.ref, 'room:primitive');
assert.equal(first.next_room_ref, 'room:human');
assert.equal(first.rotation_rooms.length, 3);
assert.equal(first.within_budget, true);
assert(first.encoded_bytes <= 3072);
assert.equal(first.metering.rebuild_full_context, false);
assert.equal(first.work_selection_allowed, true);
assert.equal(first.institutional_knowledge.state, 'CURRENT_REFERENCE_CONSUMED');
assert.equal(first.institutional_knowledge.native_readback_verified, false);
assert.equal(first.institutional_knowledge.runtime_state, 'WAIT_RUNTIME');
assert.deepEqual(first.institutional_knowledge.refs, knowledgeRefs);

// Critical hostile: rotate using only the returned ACK + delta. The caller must
// not replay the room list/full history just to preserve the ring or knowledge refs.
const second = rotateAckRoom(first, {
  subject_generation: 'g2',
  first_red: 'OWNER_VISIBLE_READBACK_UNPROVEN',
  next_machine_action: 'READ_INBOX_DEV_SURFACE'
});
assert.equal(second.room_count, 3);
assert.equal(second.rotation_rooms.length, 3);
assert.equal(second.room.ref, 'room:human');
assert.equal(second.next_room_ref, 'room:delivery');
assert.equal(second.attempt, 0);
assert.equal(second.prove, false);
assert.equal(second.work_selection_allowed, true);
assert.deepEqual(second.institutional_knowledge.refs, knowledgeRefs);

const third = rotateAckRoom(second, {
  subject_generation: 'g3',
  first_red: 'DELIVERY_READBACK_UNPROVEN',
  institutional_knowledge_native_readback_ref: 'crm-readback:samlaw:g3',
  institutional_knowledge_runtime_state: 'RUNNING',
  next_machine_action: 'VERIFY_DELIVERY_ROOM'
});
assert.equal(third.room.ref, 'room:delivery');
assert.equal(third.next_room_ref, 'room:primitive');
assert.equal(third.metering.rotate_room_not_history, true);
assert.equal(third.metering.rebuild_full_context, false);
assert.equal(third.institutional_knowledge.state, 'CURRENT_NATIVE_READBACK');
assert.equal(third.institutional_knowledge.native_readback_verified, true);

// Hostile: a template/room may not select work while required institutional
// knowledge is missing or stale. It must route to the knowledge seam first.
const blockedKnowledge = compileAckRoomRotation({
  root_ref: 'root:knowledge-hostile',
  work_ref: 'work:knowledge-hostile',
  rooms,
  institutional_knowledge_required: true,
  institutional_knowledge_current: false,
  institutional_knowledge_refs: [],
  institutional_knowledge_runtime_state: 'WAIT_RUNTIME',
  first_red: 'SOME_LOCAL_BUG',
  next_machine_action: 'START_LOCAL_WORK',
});
assert.equal(blockedKnowledge.work_selection_allowed, false);
assert.equal(blockedKnowledge.institutional_knowledge.state, 'WAIT_CURRENT_INSTITUTIONAL_KNOWLEDGE');
assert.equal(blockedKnowledge.first_red, 'INSTITUTIONAL_KNOWLEDGE_NOT_CONSUMED');
assert.equal(blockedKnowledge.next_machine_action, 'CONSUME_CURRENT_INSTITUTIONAL_KNOWLEDGE_BEFORE_WORK_SELECTION');
assert.equal(blockedKnowledge.attempt, 0);

const repairedKnowledge = rotateAckRoom(blockedKnowledge, {
  institutional_knowledge_current: true,
  institutional_knowledge_refs: ['crm-reference:current'],
  first_red: 'SOME_LOCAL_BUG',
  next_machine_action: 'START_LOCAL_WORK',
});
assert.equal(repairedKnowledge.work_selection_allowed, true);
assert.equal(repairedKnowledge.institutional_knowledge.state, 'CURRENT_REFERENCE_CONSUMED');
assert.equal(repairedKnowledge.first_red, 'SOME_LOCAL_BUG');
assert.equal(repairedKnowledge.next_machine_action, 'START_LOCAL_WORK');

console.log('ACK_ROOM_ROTATION=PASS local_ack_consumed=1 institutional_knowledge_gate=1 native_readback_distinct=1 cord_free_ollama=1 full_history_rebuild=0 ring_replay_required=0');
