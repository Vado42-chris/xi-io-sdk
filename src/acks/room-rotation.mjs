const DEFAULT_BYTE_BUDGET = 4096;
const MIN_BYTE_BUDGET = 1024;
const MAX_BYTE_BUDGET = 16384;
const text = (value, fallback = '') => String(value ?? '').trim() || fallback;
const list = (value, limit = 12) => Array.isArray(value) ? value.map((x) => text(x)).filter(Boolean).slice(0, limit) : [];
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

function budget(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) ? Math.min(MAX_BYTE_BUDGET, Math.max(MIN_BYTE_BUDGET, n)) : DEFAULT_BYTE_BUDGET;
}

function trim(packet, max) {
  if (bytes(packet) <= max) return packet;
  const out = structuredClone(packet);
  out.evidence_refs = list(out.evidence_refs, 4);
  out.cross_cutting_returns = list(out.cross_cutting_returns, 2);
  out.invariants = list(out.invariants, 5);
  out.room.detail = text(out.room.detail).slice(0, 384);
  out.first_red = text(out.first_red).slice(0, 192);
  out.next_machine_action = text(out.next_machine_action).slice(0, 384);
  out.truncated_to_budget = true;
  return out;
}

export function compileAckRoomRotation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('ACK room rotation input must be an object');
  const rooms = Array.isArray(input.rooms) && input.rooms.length
    ? input.rooms.map((room, i) => ({ ref: text(room?.ref, `room:${i + 1}`), role: text(room?.role, 'UNBOUND'), detail: text(room?.detail) }))
    : [{ ref: text(input.room_ref, 'room:current'), role: text(input.room_role, 'CURRENT'), detail: text(input.room_detail) }];
  const rawIndex = Number.isSafeInteger(input.room_index) ? input.room_index : 0;
  const roomIndex = ((rawIndex % rooms.length) + rooms.length) % rooms.length;
  const max = budget(input.byte_budget);
  const packet = {
    schema: 'xiio.sdk.ack-room-rotation/v1',
    root_ref: text(input.root_ref, 'UNBOUND'),
    work_ref: text(input.work_ref, 'UNBOUND'),
    baseline_generation: text(input.baseline_generation, 'UNKNOWN'),
    subject_generation: text(input.subject_generation, 'UNKNOWN'),
    ack_state: 'ACK',
    attempt: 0,
    prove: false,
    target: true,
    target_truth: text(input.target_truth, 'PHYSICAL_READBACK_TRUTH'),
    room_index: roomIndex,
    room_count: rooms.length,
    room: rooms[roomIndex],
    next_room_ref: rooms[(roomIndex + 1) % rooms.length].ref,
    first_red: text(input.first_red, 'UNKNOWN'),
    effect_ceiling: text(input.effect_ceiling, 'NO_EFFECT'),
    return_target_ref: text(input.return_target_ref, 'UNBOUND'),
    evidence_refs: list(input.evidence_refs),
    cross_cutting_returns: list(input.cross_cutting_returns),
    next_machine_action: text(input.next_machine_action, 'RECOLLIDE_CURRENT_ROOM'),
    byte_budget: max,
    metering: { context_strategy: 'ACK_REFS_PLUS_CURRENT_ROOM_DELTA', rebuild_full_context: false, rotate_room_not_history: true },
    invariants: list(input.invariants?.length ? input.invariants : [
      'ACK != ATTEMPT',
      'ACK_ROTATION != CONTEXT_REBUILD',
      'ROOM_CONTEXT != GLOBAL_CONTEXT',
      'EXISTING_RECEIPT != REBUILD_THE_TEN',
      'FIRST_RED + NEXT > FULL_HISTORY_REPLAY',
      'SOURCE != MAIN != RUNNING != LIVE != READBACK',
      'CROSS_CUTTING_FINDING -> RETURN_UPSTREAM + CONTINUE_LOCAL',
      'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT = BUG'
    ]),
    authority_granted: false,
    provider_effect: false
  };
  const bounded = trim(packet, max);
  return Object.freeze({ ...bounded, encoded_bytes: bytes(bounded), within_budget: bytes(bounded) <= max });
}

export function rotateAckRoom(previous = {}, delta = {}) {
  const index = Number.isSafeInteger(previous.room_index) ? previous.room_index : -1;
  return compileAckRoomRotation({ ...previous, ...delta, room_index: index + 1, baseline_generation: text(delta.baseline_generation, previous.subject_generation || previous.baseline_generation || 'UNKNOWN') });
}
