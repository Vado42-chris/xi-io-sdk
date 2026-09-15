import crypto from 'node:crypto';

export const COMMUNICATION_CHANNELS = Object.freeze([
  'EMAIL',
  'SMS',
  'MMS',
  'FAX',
  'PSTN_VOICE',
  'VOIP_CALL',
  'VOICEMAIL',
  'CHAT_IM',
  'VIDEO_MEETING',
  'WEBHOOK_NOTIFICATION',
]);

export const RECEIPT_REQUIREMENTS = Object.freeze([
  'OCCURRENCE_IDENTITY',
  'DIRECTION_BOUND',
  'CHANNEL_BOUND',
  'ENDPOINT_BOUND',
  'COUNTERPARTY_EXPLICIT',
  'WORK_SOURCE_BOUND',
  'OBSERVATION_RECEIPT',
  'PROVIDER_EFFECT_STATE_EXPLICIT',
  'TERMINAL_OUTCOME_EXPLICIT',
  'FAILURE_OR_UNKNOWN_RECONCILED',
]);

const DIRECTIONS = new Set(['INGRESS', 'EGRESS']);
const STATES = new Set([
  'OBSERVED',
  'ATTEMPTED',
  'ACCEPTED',
  'QUEUED',
  'RINGING',
  'CONNECTED',
  'TRANSMITTED',
  'RECEIVED',
  'DELIVERED',
  'READ_BACK',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'MISSED',
  'REJECTED',
  'UNKNOWN',
]);
const EFFECT_STATES = new Set(['NOT_ATTEMPTED', 'NOT_PERFORMED', 'PERFORMED', 'UNKNOWN']);
const EGRESS_EFFECT_STATES = new Set([
  'ATTEMPTED', 'ACCEPTED', 'QUEUED', 'RINGING', 'CONNECTED', 'TRANSMITTED',
  'DELIVERED', 'READ_BACK', 'COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED',
]);
const INGRESS_PROVIDER_STATES = new Set([
  'RINGING', 'CONNECTED', 'RECEIVED', 'DELIVERED', 'READ_BACK', 'COMPLETED',
  'FAILED', 'MISSED', 'REJECTED',
]);
const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'MISSED', 'REJECTED']);

function text(value) {
  return String(value ?? '').trim();
}

function required(value, code) {
  const out = text(value);
  if (!out) throw new Error(code);
  return out;
}

function enumValue(value, set, code) {
  const out = required(value, code).toUpperCase();
  if (!set.has(out)) throw new Error(code);
  return out;
}

function iso(value, code) {
  const out = required(value, code);
  const ms = Date.parse(out);
  if (!Number.isFinite(ms)) throw new Error(code);
  return new Date(ms).toISOString();
}

function stableRef(prefix, parts) {
  const digest = crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 24);
  return `${prefix}:${digest}`;
}

function normalizeChannel(value) {
  const channel = required(value, 'CHANNEL_REQUIRED').toUpperCase();
  if (!COMMUNICATION_CHANNELS.includes(channel)) throw new Error('CHANNEL_UNREGISTERED');
  return channel;
}

function explicitCounterparty(input) {
  const ref = text(input.counterparty_ref) || null;
  const state = text(input.counterparty_state || (ref ? 'KNOWN' : '')).toUpperCase();
  if (ref && state && state !== 'KNOWN') throw new Error('COUNTERPARTY_STATE_CONFLICT');
  if (!ref && state !== 'UNKNOWN') throw new Error('COUNTERPARTY_EXPLICIT_REQUIRED');
  return { counterparty_ref: ref, counterparty_state: ref ? 'KNOWN' : 'UNKNOWN' };
}

export function compileCommunicationOccurrence(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INPUT_OBJECT_REQUIRED');

  const occurrenceRef = required(input.occurrence_ref, 'OCCURRENCE_REF_REQUIRED');
  const rootRef = required(input.root_ref, 'ROOT_REF_REQUIRED');
  const workRef = required(input.work_ref, 'WORK_REF_REQUIRED');
  const sourceRef = required(input.source_ref, 'SOURCE_REF_REQUIRED');
  const endpointRef = required(input.endpoint_ref, 'ENDPOINT_REF_REQUIRED');
  const providerFamily = required(input.provider_family, 'PROVIDER_FAMILY_REQUIRED');
  const direction = enumValue(input.direction, DIRECTIONS, 'DIRECTION_INVALID');
  const channel = normalizeChannel(input.channel);
  const state = enumValue(input.state, STATES, 'STATE_INVALID');
  const observedAt = iso(input.observed_at, 'OBSERVED_AT_INVALID');
  const observationReceiptRef = required(input.observation_receipt_ref, 'OBSERVATION_RECEIPT_REQUIRED');
  const counterparty = explicitCounterparty(input);

  let effectState = text(input.effect_state).toUpperCase() || null;
  const providerReceiptRef = text(input.provider_receipt_ref) || null;
  const effectReceiptRef = text(input.effect_receipt_ref) || null;
  const reconciliationRef = text(input.reconciliation_ref) || null;
  const wakeRef = text(input.wake_ref) || null;
  const errorCode = text(input.error_code) || null;

  if (effectState && !EFFECT_STATES.has(effectState)) throw new Error('EFFECT_STATE_INVALID');

  if (direction === 'EGRESS' && EGRESS_EFFECT_STATES.has(state)) {
    if (!effectState) throw new Error('EGRESS_EFFECT_STATE_REQUIRED');
    if (effectState !== 'NOT_ATTEMPTED' && !effectReceiptRef) throw new Error('EFFECT_RECEIPT_REQUIRED');
    if (effectState === 'PERFORMED' && !providerReceiptRef) throw new Error('PROVIDER_RECEIPT_REQUIRED_FOR_PERFORMED');
  }

  if (direction === 'INGRESS') {
    if (!effectState) effectState = 'NOT_ATTEMPTED';
    if (INGRESS_PROVIDER_STATES.has(state) && !providerReceiptRef) {
      throw new Error('INGRESS_PROVIDER_RECEIPT_REQUIRED');
    }
  }

  if (!effectState) effectState = 'NOT_ATTEMPTED';

  const uncertain = state === 'UNKNOWN' || effectState === 'UNKNOWN';
  if (uncertain && (!reconciliationRef || !wakeRef)) {
    throw new Error('UNKNOWN_REQUIRES_RECONCILIATION_AND_WAKE');
  }

  if (state === 'FAILED' && (!errorCode || !wakeRef)) {
    throw new Error('FAILED_REQUIRES_ERROR_AND_WAKE');
  }

  if (TERMINAL_STATES.has(state) && input.terminal !== true) {
    throw new Error('TERMINAL_STATE_REQUIRES_TERMINAL_TRUE');
  }
  if (!TERMINAL_STATES.has(state) && input.terminal === true) {
    throw new Error('TERMINAL_TRUE_STATE_MISMATCH');
  }

  const projectionReceiptRef = stableRef('comm-receipt', [
    rootRef,
    workRef,
    sourceRef,
    occurrenceRef,
    direction,
    channel,
    state,
    observedAt,
    observationReceiptRef,
  ]);

  let disposition = 'LOCAL_OBSERVATION_RECEIPTED';
  if (uncertain) disposition = 'RECONCILIATION_REQUIRED';
  else if (providerReceiptRef) disposition = 'PROVIDER_RECEIPT_SUPPLIED_UNVERIFIED';
  else if (direction === 'EGRESS' && effectState !== 'NOT_ATTEMPTED') disposition = 'EFFECT_RECEIPTED_PROVIDER_READBACK_DUE';

  return Object.freeze({
    schema: 'xiio.sdk.communication-occurrence-projection/v1',
    occurrence_ref: occurrenceRef,
    communication_receipt_ref: projectionReceiptRef,
    root_ref: rootRef,
    work_ref: workRef,
    source_ref: sourceRef,
    direction,
    channel,
    endpoint_ref: endpointRef,
    counterparty_ref: counterparty.counterparty_ref,
    counterparty_state: counterparty.counterparty_state,
    provider_family: providerFamily,
    state,
    terminal: TERMINAL_STATES.has(state),
    observed_at: observedAt,
    observation_receipt_ref: observationReceiptRef,
    effect_state: effectState,
    effect_receipt_ref: effectReceiptRef,
    provider_receipt_ref: providerReceiptRef,
    provider_receipt_state: providerReceiptRef ? 'SUPPLIED_UNVERIFIED' : 'NONE',
    provider_native_proven: false,
    reconciliation_ref: reconciliationRef,
    wake_ref: wakeRef,
    error_code: errorCode,
    disposition,
    silent_failure_blocked_structurally: true,
    authority: {
      transmit: false,
      provider_effect: false,
      legal_effect: false,
      close_work: false,
    },
    hard: [
      'COMMUNICATION_OBSERVED != PROVIDER_EFFECT_PROVEN',
      'OBSERVATION_RECEIPT != PROVIDER_RECEIPT',
      'PROVIDER_RECEIPT_REF != PROVIDER_NATIVE_PROOF',
      'INGRESS != TRUSTED_WITHOUT_PROVIDER_EVIDENCE',
      'EGRESS_ATTEMPT != EGRESS_PERFORMED',
      'PROVIDER_EFFECT_UNKNOWN => RECONCILIATION_REQUIRED',
      'FAILED => ERROR_AND_WAKE_REQUIRED',
      'MISSING_RECEIPT != SILENT_SUCCESS',
      'SDK_PROJECTION != EFFECT_AUTHORITY',
      'TERMINAL_COMMUNICATION != ROOT_TERMINAL',
    ],
  });
}

export function compileCommunicationLedger(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INPUT_OBJECT_REQUIRED');
  const ledgerRef = required(input.ledger_ref, 'LEDGER_REF_REQUIRED');
  const rows = Array.isArray(input.occurrences) ? input.occurrences.map(compileCommunicationOccurrence) : [];
  const ids = rows.map((row) => row.occurrence_ref);
  if (new Set(ids).size !== ids.length) throw new Error('OCCURRENCE_REF_DUPLICATE');

  const reconciliation = rows.filter((row) => row.disposition === 'RECONCILIATION_REQUIRED');
  const failures = rows.filter((row) => row.state === 'FAILED');
  const byChannel = Object.fromEntries(COMMUNICATION_CHANNELS.map((channel) => [
    channel,
    rows.filter((row) => row.channel === channel).length,
  ]));

  return Object.freeze({
    schema: 'xiio.sdk.communication-ledger-projection/v1',
    ledger_ref: ledgerRef,
    occurrence_count: rows.length,
    reconciliation_required_count: reconciliation.length,
    failure_count: failures.length,
    by_channel: byChannel,
    occurrences: rows,
    silent_failure_allowed: false,
    provider_native_proven: false,
    effect_authority: false,
  });
}

export function auditCommunicationHistory(input = {}) {
  const rows = Array.isArray(input.occurrences) ? input.occurrences : [];
  const accepted = [];
  const gaps = [];

  rows.forEach((row, index) => {
    try {
      accepted.push(compileCommunicationOccurrence(row));
    } catch (error) {
      gaps.push({
        index,
        occurrence_ref: text(row?.occurrence_ref) || null,
        code: String(error?.message || error),
        disposition: 'RETROACTIVE_RECONCILIATION_REQUIRED',
      });
    }
  });

  return Object.freeze({
    schema: 'xiio.sdk.communication-history-audit/v1',
    observed_count: rows.length,
    receipted_count: accepted.length,
    gap_count: gaps.length,
    accepted,
    gaps,
    closure_100: rows.length > 0 && gaps.length === 0,
    provider_native_proven: false,
    effect_authority: false,
  });
}

export function compileCommunicationHundreds() {
  const cells = [];
  for (const channel of COMMUNICATION_CHANNELS) {
    for (const requirement of RECEIPT_REQUIREMENTS) {
      cells.push(Object.freeze({
        cell_ref: `COMM-100:${channel}:${requirement}`,
        channel,
        requirement,
        state: 'REQUIRES_ADOPTION_PROOF',
      }));
    }
  }
  return Object.freeze({
    schema: 'xiio.sdk.communication-receipt-100s/v1',
    channels: COMMUNICATION_CHANNELS,
    requirements: RECEIPT_REQUIREMENTS,
    expected_cells: 100,
    cells,
    closure_100: false,
    provider_native_proven: false,
    effect_authority: false,
  });
}
