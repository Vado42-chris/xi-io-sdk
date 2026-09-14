export const FORMAL_CHAIN = Object.freeze([
  'summons', 'root', 'primitives', 'punch_cards', 'score_cards', 'formation',
  'admission', 'ack', 'attempt', 'result', 'return', 'apply_return', 'reprojection'
]);
export const REGISTRY_IDENTITY = Object.freeze({
  schema: 'xiio.sdk.ibal-root-projection-registry-identity/v1',
  generation: 'ibal-root-projection-registry@1',
  contract_digest: 'sha256:d2b9523d42157d274eb7d2931a7f090939e0be7dac6a72ed2700b64692e55156',
  sdk_package_version: '0.1.0-candidate.2'
});

const required = (value, label, blockers) => {
  if (typeof value !== 'string' || value.trim() === '') blockers.push(`${label}_REQUIRED`);
};
const duplicates = (rows = []) => rows.filter((x, i) => rows.findIndex(y => y.ref === x.ref) !== i).map(x => x.ref);

/** Pure, provider-neutral classifier. It never admits work, mints ACKs, or performs effects. */
export function compileIbalRootProjection(input = {}) {
  const blockers = [];
  const root = input.root ?? {};
  required(input.summons?.ref, 'SUMMONS_REF', blockers);
  required(root.ref, 'ROOT_REF', blockers);
  required(root.generation, 'ROOT_GENERATION', blockers);
  if (!input.formation || typeof input.formation !== 'object') blockers.push('FORMATION_REQUIRED');
  else {
    required(input.formation.ref, 'FORMATION_REF', blockers);
    if (!sameRootSafe(input.formation, root)) blockers.push('FORMATION_ROOT_MISMATCH');
    required(input.formation.reducer_ref, 'FORMATION_REDUCER_REF', blockers);
  }

  const sets = ['primitives', 'punch_cards', 'score_cards', 'assignments', 'acks', 'attempts', 'results', 'returns', 'apply_returns'];
  for (const key of sets) {
    const rows = input[key] ?? [];
    if (!Array.isArray(rows)) blockers.push(`${key.toUpperCase()}_MUST_BE_ARRAY`);
    else if (duplicates(rows).length) blockers.push(`DUPLICATE_${key.toUpperCase()}_REF`);
  }
  const primitives = new Set((input.primitives ?? []).map(x => x.ref));
  if (primitives.size === 0) blockers.push('PRIMITIVES_REQUIRED');
  if ((input.punch_cards ?? []).length === 0) blockers.push('PUNCH_CARDS_REQUIRED');
  if ((input.score_cards ?? []).length === 0) blockers.push('SCORE_CARDS_REQUIRED');
  for (const card of input.punch_cards ?? []) {
    required(card.ref, 'PUNCH_CARD_REF', blockers);
    if (!Array.isArray(card.primitive_refs) || card.primitive_refs.length === 0) blockers.push('PUNCH_CARD_PRIMITIVES_REQUIRED');
    else if (card.primitive_refs.some(ref => !primitives.has(ref))) blockers.push('PUNCH_CARD_PRIMITIVE_UNKNOWN');
  }
  for (const card of input.score_cards ?? []) {
    required(card.ref, 'SCORE_CARD_REF', blockers);
    if (!Number.isFinite(card.denominator) || card.denominator <= 0) blockers.push('SCORE_CARD_DENOMINATOR_INVALID');
  }

  const admission = input.admission;
  const sameRoot = x => x?.root_ref === root.ref && x?.root_generation === root.generation;
  if (admission && !sameRoot(admission)) blockers.push('ADMISSION_ROOT_MISMATCH');
  if (admission) required(admission.ref, 'ADMISSION_REF', blockers);
  const assignments = input.assignments ?? [];
  if (assignments.length && !admission) blockers.push('ASSIGNMENT_WITHOUT_ADMISSION');
  for (const x of assignments) {
    required(x.ref, 'ASSIGNMENT_REF', blockers);
    if (!sameRoot(x)) blockers.push('ASSIGNMENT_ROOT_MISMATCH');
    required(x.consumer_ref, 'ASSIGNMENT_CONSUMER_REF', blockers);
    required(x.consumer_generation, 'ASSIGNMENT_CONSUMER_GENERATION', blockers);
    if (x.role === 'watcher' && (x.execute === true || x.effect === true)) blockers.push('WATCHER_EFFECT_PROHIBITED');
  }
  const assignmentByRef = new Map(assignments.map(x => [x.ref, x]));
  for (const ack of input.acks ?? []) {
    required(ack.ref, 'ACK_REF', blockers);
    const assignment = assignmentByRef.get(ack.assignment_ref);
    if (!assignment || !sameRoot(ack) || ack.consumer_ref !== assignment.consumer_ref || ack.consumer_generation !== assignment.consumer_generation) blockers.push('ACK_BINDING_MISMATCH');
  }
  const acked = new Set((input.acks ?? []).map(x => x.assignment_ref));
  const attempts = input.attempts ?? [];
  for (const x of attempts) if (!acked.has(x.assignment_ref) || !sameRoot(x)) blockers.push('ATTEMPT_WITHOUT_MATCHING_ACK');
  for (const x of attempts) required(x.ref, 'ATTEMPT_REF', blockers);
  const attempted = new Set(attempts.map(x => x.ref));
  for (const x of input.results ?? []) { required(x.ref, 'RESULT_REF', blockers); if (!attempted.has(x.attempt_ref) || !sameRoot(x)) blockers.push('RESULT_WITHOUT_MATCHING_ATTEMPT'); }
  const resultRefs = new Set((input.results ?? []).map(x => x.ref));
  for (const x of input.returns ?? []) { required(x.ref, 'RETURN_REF', blockers); if (!resultRefs.has(x.result_ref) || !sameRoot(x)) blockers.push('RETURN_WITHOUT_MATCHING_RESULT'); }
  const returnRefs = new Set((input.returns ?? []).map(x => x.ref));
  for (const x of input.apply_returns ?? []) { required(x.ref, 'APPLY_RETURN_REF', blockers); if (!returnRefs.has(x.return_ref) || !sameRoot(x)) blockers.push('APPLY_RETURN_WITHOUT_MATCHING_RETURN'); }

  let projection_state = 'PROJECTION_READY_ADMISSION_UNBOUND';
  let next_transition = 'ADMISSION';
  if (admission) [projection_state, next_transition] = ['TASK_ADMITTED_ACK_DUE', 'ACK'];
  if (assignments.length && assignments.every(x => acked.has(x.ref))) [projection_state, next_transition] = ['ACTIVE_ATTEMPT_DUE', 'ATTEMPT'];
  if (attempts.length) [projection_state, next_transition] = ['ACTIVE_RESULT_DUE', 'RESULT'];
  if ((input.results ?? []).length) [projection_state, next_transition] = ['RETURN_DUE', 'RETURN'];
  if ((input.returns ?? []).length) [projection_state, next_transition] = ['APPLY_RETURN_DUE', 'APPLY_RETURN'];
  if ((input.apply_returns ?? []).length) [projection_state, next_transition] = ['REPROJECTION_DUE', 'REPROJECTION'];
  if (blockers.length) [projection_state, next_transition] = ['BLOCKED', 'REPAIR'];

  return {
    schema: 'xiio.sdk.ibal-root-projection/v1', registry: REGISTRY_IDENTITY, formal_chain: FORMAL_CHAIN,
    root_ref: root.ref ?? null, root_generation: root.generation ?? null,
    projection_state, next_transition, blockers: [...new Set(blockers)],
    counts: Object.fromEntries(sets.map(k => [k, Array.isArray(input[k]) ? input[k].length : 0])),
    authority: { admit: false, ack: false, execute: false, effect: false, deploy: false },
    provider_effect: false, closure_claimed: false
  };
}

function sameRootSafe(value, root) {
  return value?.root_ref === root.ref && value?.root_generation === root.generation;
}
