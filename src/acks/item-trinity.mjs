import crypto from 'node:crypto';

export const ACK_ITEM_TRINITY_INPUT_SCHEMA = 'xiio.sdk.ack-item-trinity-input/v1';
export const ACK_ITEM_TRINITY_SCHEMA = 'xiio.sdk.ack-item-trinity/v1';

const STATES = new Set(['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE']);
const HEX_STATES = new Set(['QUALIFIED','UNVERIFIED','REJECTED','N_A']);
const CURRENTNESS_STATES = new Set(['CURRENT','STALE','UNKNOWN','N_A']);
const REAP_STATES = new Set(['DONE','PENDING','UNKNOWN','N_A']);

const bounded = (value, max = 512) =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;

const compareText = (a,b) => a === b ? 0 : a < b ? -1 : 1;
const encodeIdentityPart = (value) => value.replaceAll('%','%25').replaceAll('#','%23');

function bit(value, label) {
  if (value !== 0 && value !== 1) throw new TypeError(`${label} must be 0|1`);
  return value;
}

function refs(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const out = value.map((item) => {
    if (!bounded(item)) throw new TypeError(`${label} contains invalid ref`);
    return item;
  });
  return [...new Set(out)].sort();
}

function optionalRef(value, label) {
  if (value == null) return null;
  if (!bounded(value)) throw new TypeError(`${label} invalid`);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

function normalizeItem(raw, source, rootGeneration) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('ACK item must be an object');
  for (const field of ['item_id','path_ref','label']) {
    if (!bounded(raw[field])) throw new TypeError(`${field} required`);
  }
  const applicable = bit(raw.applicable_bit, `${raw.item_id}.applicable_bit`);
  const required = bit(raw.required_bit, `${raw.item_id}.required_bit`);
  const material = bit(raw.material_bit, `${raw.item_id}.material_bit`);
  if (required === 1 && material === 0) throw new TypeError(`required ACK item cannot be non-material: ${raw.item_id}`);
  if (!STATES.has(raw.declared_state)) throw new TypeError(`declared_state invalid: ${raw.item_id}`);

  const ownerRef = optionalRef(raw.owner_ref, `${raw.item_id}.owner_ref`);
  const workRef = optionalRef(raw.work_ref, `${raw.item_id}.work_ref`);
  if (applicable === 1 && required === 1 && material === 1 && (!ownerRef || !workRef)) {
    throw new TypeError(`required applicable material ACK item needs owner_ref and work_ref: ${raw.item_id}`);
  }

  const evidenceRefs = refs(raw.evidence_refs ?? [], `${raw.item_id}.evidence_refs`);
  const hex = raw.hex_qualification ?? {};
  if (!HEX_STATES.has(hex.state)) throw new TypeError(`hex_qualification.state invalid: ${raw.item_id}`);
  const hexReceipt = optionalRef(hex.receipt_ref, `${raw.item_id}.hex_qualification.receipt_ref`);
  if (hex.state === 'QUALIFIED' && !hexReceipt) throw new TypeError(`HEX QUALIFIED requires receipt_ref: ${raw.item_id}`);

  const currentness = raw.currentness ?? {};
  if (!CURRENTNESS_STATES.has(currentness.state)) throw new TypeError(`currentness.state invalid: ${raw.item_id}`);
  const currentnessEvidence = optionalRef(currentness.evidence_ref, `${raw.item_id}.currentness.evidence_ref`);
  if (currentness.state === 'CURRENT' && !currentnessEvidence) throw new TypeError(`CURRENT requires evidence_ref: ${raw.item_id}`);

  if (!REAP_STATES.has(raw.reap_state)) throw new TypeError(`reap_state invalid: ${raw.item_id}`);

  return {
    ack_ref: source.ack_ref,
    ack_generation: source.ack_generation,
    root_generation: rootGeneration,
    item_id: raw.item_id,
    path_ref: raw.path_ref,
    label: raw.label,
    applicable_bit: applicable,
    required_bit: required,
    material_bit: material,
    owner_ref: ownerRef,
    work_ref: workRef,
    declared_state: raw.declared_state,
    evidence_refs: evidenceRefs,
    hex_qualification: { state: hex.state, receipt_ref: hexReceipt },
    currentness: { state: currentness.state, evidence_ref: currentnessEvidence },
    result_ref: optionalRef(raw.result_ref, `${raw.item_id}.result_ref`),
    return_ref: optionalRef(raw.return_ref, `${raw.item_id}.return_ref`),
    apply_return_ref: optionalRef(raw.apply_return_ref, `${raw.item_id}.apply_return_ref`),
    reap_state: raw.reap_state,
  };
}

function scoreState(item) {
  if (item.applicable_bit === 0) return { state:'N_A_WITH_EVIDENCE', blocker:null };
  if (item.declared_state === 'PASS' || item.declared_state === 'N_A_WITH_EVIDENCE') {
    if (item.evidence_refs.length === 0) return { state:'UNKNOWN', blocker:'POSITIVE_STATE_WITHOUT_EVIDENCE' };
    return { state:'SUPPLIED_UNVERIFIED', blocker:'AUTHENTICATED_EVIDENCE_REQUIRED' };
  }
  return { state:item.declared_state, blocker:item.declared_state === 'UNKNOWN' ? 'STATE_UNKNOWN' : null };
}

function checklist(item) {
  const rows = [];
  const add = (id, state, reason) => rows.push({ id, state, reason });

  if (item.applicable_bit === 0) {
    for (const id of ['HEX_QUALIFIED','CURRENTNESS_BOUND','EVIDENCE_BOUND','RESULT_PRESENT','RETURN_PRESENT','APPLY_RETURN_PRESENT','REAP_COMPLETE']) {
      add(id, 'N_A', 'ITEM_NOT_APPLICABLE');
    }
    return rows;
  }

  add('HEX_QUALIFIED',
    item.hex_qualification.state === 'QUALIFIED' ? 'SUPPLIED_UNVERIFIED'
      : item.hex_qualification.state === 'REJECTED' ? 'WAIT'
      : item.hex_qualification.state === 'N_A' ? 'N_A' : 'UNKNOWN',
    item.hex_qualification.state === 'QUALIFIED' ? 'HEX_RECEIPT_SUPPLIED_NOT_AUTHENTICATED'
      : item.hex_qualification.state === 'REJECTED' ? 'HEX_REJECTED'
      : item.hex_qualification.state === 'N_A' ? 'HEX_N_A' : 'HEX_QUALIFICATION_UNVERIFIED');

  add('CURRENTNESS_BOUND',
    item.currentness.state === 'CURRENT' ? 'SUPPLIED_UNVERIFIED'
      : item.currentness.state === 'STALE' ? 'WAIT'
      : item.currentness.state === 'N_A' ? 'N_A' : 'UNKNOWN',
    item.currentness.state === 'CURRENT' ? 'CURRENTNESS_RECEIPT_SUPPLIED_NOT_AUTHENTICATED'
      : item.currentness.state === 'STALE' ? 'CURRENTNESS_STALE'
      : item.currentness.state === 'N_A' ? 'CURRENTNESS_N_A' : 'CURRENTNESS_UNKNOWN');

  add('EVIDENCE_BOUND', item.evidence_refs.length ? 'SUPPLIED_UNVERIFIED' : 'WAIT',
    item.evidence_refs.length ? 'EVIDENCE_REFS_SUPPLIED_NOT_AUTHENTICATED' : 'EVIDENCE_MISSING');
  add('RESULT_PRESENT', item.result_ref ? 'SUPPLIED_UNVERIFIED' : 'WAIT', item.result_ref ? 'RESULT_REF_SUPPLIED' : 'RESULT_MISSING');
  add('RETURN_PRESENT', item.return_ref ? 'SUPPLIED_UNVERIFIED' : 'WAIT', item.return_ref ? 'RETURN_REF_SUPPLIED' : 'RETURN_MISSING');
  add('APPLY_RETURN_PRESENT', item.apply_return_ref ? 'SUPPLIED_UNVERIFIED' : 'WAIT', item.apply_return_ref ? 'APPLY_RETURN_REF_SUPPLIED' : 'APPLY_RETURN_MISSING');
  add('REAP_COMPLETE', item.reap_state === 'DONE' ? 'SUPPLIED_UNVERIFIED' : item.reap_state === 'N_A' ? 'N_A' : 'WAIT',
    item.reap_state === 'DONE' ? 'REAP_DECLARED_DONE_NOT_AUTHENTICATED' : item.reap_state === 'N_A' ? 'REAP_N_A' : 'REAP_OPEN');
  return rows;
}

function compileOne(item) {
  const itemRef = encodeIdentityPart(item.ack_ref) + '#' + encodeIdentityPart(item.item_id);
  const trinityId = digest({
    root_generation:item.root_generation,
    ack_ref:item.ack_ref,
    ack_generation:item.ack_generation,
    item_id:item.item_id,
    path_ref:item.path_ref,
  });
  const score = scoreState(item);
  const checklistRows = checklist(item);
  const applicable = item.applicable_bit === 1;

  return {
    item_ref:itemRef,
    trinity_id:trinityId,
    punch_card:{
      schema:'xiio.sdk.ack-item-punch-card/v1',
      card_ref:`punch:${trinityId}`,
      item_ref:itemRef,
      root_generation:item.root_generation,
      ack_ref:item.ack_ref,
      ack_generation:item.ack_generation,
      path_ref:item.path_ref,
      label:item.label,
      owner_ref:item.owner_ref,
      work_ref:item.work_ref,
      obligation_state:!applicable ? 'N_A' : item.required_bit === 1 ? 'REQUIRED' : 'OPTIONAL',
      material:item.material_bit === 1,
      next:!applicable ? null : score.state === 'SUPPLIED_UNVERIFIED' ? 'VERIFY_SUPPLIED_STATE' : 'RESOLVE_ACK_ITEM',
      authority_granted:false,
      provider_effect:false,
    },
    score_card:{
      schema:'xiio.sdk.ack-item-score-card/v1',
      score_ref:`score:${trinityId}`,
      item_ref:itemRef,
      declared_state:item.declared_state,
      projected_state:score.state,
      blocker:score.blocker,
      evidence_refs:item.evidence_refs,
      hex_qualification_state:item.hex_qualification.state,
      currentness_state:item.currentness.state,
      closure_credit:false,
      authority_granted:false,
      provider_effect:false,
    },
    checklist:{
      schema:'xiio.sdk.ack-item-checklist/v1',
      checklist_ref:`checklist:${trinityId}`,
      item_ref:itemRef,
      rows:checklistRows,
      supplied_complete:checklistRows.every((row) => ['SUPPLIED_UNVERIFIED','N_A'].includes(row.state)),
      closure_100:false,
      first_open:checklistRows.find((row) => !['SUPPLIED_UNVERIFIED','N_A'].includes(row.state)) ?? {
        id:'VERIFY_SUPPLIED_CHECKLIST',
        state:'SUPPLIED_UNVERIFIED',
        reason:'AUTHENTICATED_CHECKLIST_READBACK_REQUIRED',
      },
      authority_granted:false,
      provider_effect:false,
    },
  };
}

export function compileAckItemTrinity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be an object');
  if (input.schema !== ACK_ITEM_TRINITY_INPUT_SCHEMA) throw new TypeError('input schema mismatch');
  for (const field of ['root_ref','root_generation','studio_root_ref']) {
    if (!bounded(input[field])) throw new TypeError(`${field} required`);
  }
  if (!Array.isArray(input.ack_sources) || input.ack_sources.length === 0) throw new TypeError('ack_sources required');

  const ackRefs = new Set();
  const normalized = [];
  for (const source of input.ack_sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('ACK source invalid');
    for (const field of ['ack_ref','ack_generation','root_generation']) {
      if (!bounded(source[field])) throw new TypeError(`ACK source ${field} required`);
    }
    if (source.root_generation !== input.root_generation) throw new TypeError(`ACK source root_generation mismatch: ${source.ack_ref}`);
    if (ackRefs.has(source.ack_ref)) throw new TypeError(`duplicate ack_ref: ${source.ack_ref}`);
    ackRefs.add(source.ack_ref);
    if (!Array.isArray(source.items) || source.items.length === 0) throw new TypeError(`ACK source items required: ${source.ack_ref}`);
    const itemIds = new Set();
    for (const raw of source.items) {
      if (itemIds.has(raw?.item_id)) throw new TypeError(`duplicate item_id in ${source.ack_ref}: ${raw?.item_id}`);
      itemIds.add(raw?.item_id);
      normalized.push(normalizeItem(raw, source, input.root_generation));
    }
  }

  const trinity = normalized
    .sort((a,b) => compareText(a.ack_ref,b.ack_ref) || compareText(a.item_id,b.item_id))
    .map(compileOne);

  const applicableCount = normalized.filter((item) => item.applicable_bit === 1).length;
  const naCount = normalized.length - applicableCount;
  const openItemRefs = trinity
    .filter((entry) =>
      entry.checklist.supplied_complete !== true ||
      entry.punch_card.next === 'RESOLVE_ACK_ITEM')
    .map((entry) => entry.item_ref);

  return Object.freeze({
    schema:ACK_ITEM_TRINITY_SCHEMA,
    root_ref:input.root_ref,
    root_generation:input.root_generation,
    studio_root_ref:input.studio_root_ref,
    ack_source_count:input.ack_sources.length,
    ack_item_count:normalized.length,
    punch_card_count:trinity.length,
    score_card_count:trinity.length,
    checklist_count:trinity.length,
    applicable_count:applicableCount,
    n_a_count:naCount,
    trinity_accounting_100:
      trinity.length === normalized.length &&
      trinity.length === trinity.filter((entry) => entry.punch_card && entry.score_card && entry.checklist).length,
    silent_remainder:0,
    open_item_refs:openItemRefs,
    selection_state:openItemRefs.length ? 'X43_SELECTION_REQUIRED' : 'VERIFY_SUPPLIED_TRINITY',
    trinity,
    authority_granted:false,
    provider_effect:false,
    external_communication:false,
    hard:[
      'ACK_ITEM_IDENTITY = PUNCH_CARD_IDENTITY = SCORE_CARD_IDENTITY = CHECKLIST_IDENTITY',
      'SCORECARD != PUNCHCARD',
      'CHECKLIST != SCORECARD',
      'CHECKLIST != PUNCHCARD',
      'ACK_ITEM_COUNT = PUNCH_CARD_COUNT = SCORE_CARD_COUNT = CHECKLIST_COUNT',
      'NON_APPLICABLE != DROPPED',
      'SUPPLIED_PASS != VERIFIED_PASS',
      'HEX_QUALIFIED_RECEIPT != AUTHENTICATED_QUALIFICATION',
      'CURRENTNESS_RECEIPT != PROVIDER_CURRENTNESS_AUTHORITY',
      'OPEN_ITEM_LIST != X43_PRIORITY',
      'ARRAY_ORDER != PRIORITY',
      'RESULT != RETURN != APPLY_RETURN',
      'SDK_PROJECTION != EFFECT_AUTHORITY',
    ],
  });
}
