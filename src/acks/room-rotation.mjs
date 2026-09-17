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

function normalizeRooms(input = {}) {
  const supplied = Array.isArray(input.rooms) && input.rooms.length
    ? input.rooms
    : Array.isArray(input.rotation_rooms) && input.rotation_rooms.length
      ? input.rotation_rooms
      : null;
  return supplied
    ? supplied.slice(0, 12).map((room, i) => ({
        ref: text(room?.ref, `room:${i + 1}`),
        role: text(room?.role, 'UNBOUND'),
        detail: text(room?.detail),
      }))
    : [{
        ref: text(input.room_ref ?? input.room?.ref, 'room:current'),
        role: text(input.room_role ?? input.room?.role, 'CURRENT'),
        detail: text(input.room_detail ?? input.room?.detail),
      }];
}

function normalizeInstitutionalKnowledge(input = {}) {
  const prior = input.institutional_knowledge && typeof input.institutional_knowledge === 'object'
    ? input.institutional_knowledge
    : {};
  const required = input.institutional_knowledge_required === true || prior.required === true;
  const current = input.institutional_knowledge_current === true || prior.current === true;
  const refs = list(
    Array.isArray(input.institutional_knowledge_refs) ? input.institutional_knowledge_refs : prior.refs,
    12,
  );
  const nativeReadbackRef = text(
    input.institutional_knowledge_native_readback_ref ?? prior.native_readback_ref,
  ) || null;
  const runtimeState = text(
    input.institutional_knowledge_runtime_state ?? prior.runtime_state,
    'UNKNOWN',
  ).toUpperCase();
  const workSelectionAllowed = !required || (current && refs.length > 0);
  return {
    required,
    current,
    refs,
    runtime_state: runtimeState,
    native_readback_ref: nativeReadbackRef,
    native_readback_verified: Boolean(nativeReadbackRef),
    state: !required
      ? 'NOT_REQUIRED'
      : workSelectionAllowed
        ? nativeReadbackRef ? 'CURRENT_NATIVE_READBACK' : 'CURRENT_REFERENCE_CONSUMED'
        : 'WAIT_CURRENT_INSTITUTIONAL_KNOWLEDGE',
    work_selection_allowed: workSelectionAllowed,
  };
}

function trim(packet, max) {
  if (bytes(packet) <= max) return packet;
  const out = structuredClone(packet);
  out.evidence_refs = list(out.evidence_refs, 4);
  out.cross_cutting_returns = list(out.cross_cutting_returns, 2);
  if (out.institutional_knowledge) out.institutional_knowledge.refs = list(out.institutional_knowledge.refs, 4);
  out.invariants = list(out.invariants, 5);
  out.rotation_rooms = (out.rotation_rooms || []).map((room) => ({
    ref: text(room.ref).slice(0, 128),
    role: text(room.role).slice(0, 96),
    detail: text(room.detail).slice(0, 160),
  }));
  out.room.detail = text(out.room.detail).slice(0, 192);
  out.first_red = text(out.first_red).slice(0, 192);
  out.next_machine_action = text(out.next_machine_action).slice(0, 384);
  out.truncated_to_budget = true;
  if (bytes(out) <= max) return out;

  out.rotation_rooms = out.rotation_rooms.map((room) => ({ ref: room.ref, role: room.role, detail: '' }));
  out.evidence_refs = list(out.evidence_refs, 2);
  out.cross_cutting_returns = list(out.cross_cutting_returns, 1);
  if (out.institutional_knowledge) out.institutional_knowledge.refs = list(out.institutional_knowledge.refs, 2);
  out.invariants = list(out.invariants, 4);
  return out;
}

export function compileAckRoomRotation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('ACK room rotation input must be an object');
  const rooms = normalizeRooms(input);
  const knowledge = normalizeInstitutionalKnowledge(input);
  const rawIndex = Number.isSafeInteger(input.room_index) ? input.room_index : 0;
  const roomIndex = ((rawIndex % rooms.length) + rooms.length) % rooms.length;
  const max = budget(input.byte_budget);
  const requestedNext = text(input.next_machine_action, 'RECOLLIDE_CURRENT_ROOM');
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
    rotation_rooms: rooms,
    first_red: knowledge.work_selection_allowed
      ? text(input.first_red, 'UNKNOWN')
      : 'INSTITUTIONAL_KNOWLEDGE_NOT_CONSUMED',
    effect_ceiling: text(input.effect_ceiling, 'NO_EFFECT'),
    return_target_ref: text(input.return_target_ref, 'UNBOUND'),
    evidence_refs: list(input.evidence_refs),
    cross_cutting_returns: list(input.cross_cutting_returns),
    institutional_knowledge: knowledge,
    work_selection_allowed: knowledge.work_selection_allowed,
    next_machine_action: knowledge.work_selection_allowed
      ? requestedNext
      : 'CONSUME_CURRENT_INSTITUTIONAL_KNOWLEDGE_BEFORE_WORK_SELECTION',
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
      'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT = BUG',
      'REPORT_REFERENCE != NATIVE_CRM_READBACK',
      'TEMPLATE_EXISTS != TEMPLATE_CONSUMED',
      'REQUIRED_INSTITUTIONAL_KNOWLEDGE_NOT_CURRENT => WORK_SELECTION_BLOCKED'
    ]),
    authority_granted: false,
    provider_effect: false
  };
  const bounded = trim(packet, max);
  return Object.freeze({ ...bounded, encoded_bytes: bytes(bounded), within_budget: bytes(bounded) <= max });
}

export function rotateAckRoom(previous = {}, delta = {}) {
  const index = Number.isSafeInteger(previous.room_index) ? previous.room_index : -1;
  return compileAckRoomRotation({
    ...previous,
    ...delta,
    rooms: Array.isArray(delta.rooms) && delta.rooms.length ? delta.rooms : previous.rotation_rooms,
    room_index: index + 1,
    baseline_generation: text(delta.baseline_generation, previous.subject_generation || previous.baseline_generation || 'UNKNOWN')
  });
}
