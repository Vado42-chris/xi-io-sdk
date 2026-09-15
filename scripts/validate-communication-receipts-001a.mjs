import assert from 'node:assert/strict';
import {
  COMMUNICATION_CHANNELS,
  RECEIPT_REQUIREMENTS,
  auditCommunicationHistory,
  compileCommunicationHundreds,
  compileCommunicationLedger,
  compileCommunicationOccurrence,
} from '../src/communications/receipt-ledger.mjs';

function base(overrides = {}) {
  return {
    occurrence_ref: 'occ:test:001',
    root_ref: 'root:test',
    work_ref: 'work:test',
    source_ref: 'source:test',
    direction: 'EGRESS',
    channel: 'EMAIL',
    endpoint_ref: 'endpoint:test',
    counterparty_ref: 'counterparty:test',
    provider_family: 'synthetic-provider',
    state: 'COMPLETED',
    terminal: true,
    observed_at: '2026-09-15T16:00:00-06:00',
    observation_receipt_ref: 'receipt:observation:001',
    effect_state: 'PERFORMED',
    effect_receipt_ref: 'receipt:effect:001',
    provider_receipt_ref: 'receipt:provider:001',
    ...overrides,
  };
}

const hundreds = compileCommunicationHundreds();
assert.equal(COMMUNICATION_CHANNELS.length, 10);
assert.equal(RECEIPT_REQUIREMENTS.length, 10);
assert.equal(hundreds.expected_cells, 100);
assert.equal(hundreds.cells.length, 100);
assert.equal(new Set(hundreds.cells.map((cell) => cell.cell_ref)).size, 100);
assert.equal(hundreds.closure_100, false);
assert.equal(hundreds.effect_authority, false);

for (const channel of COMMUNICATION_CHANNELS) {
  const occurrence = compileCommunicationOccurrence(base({
    occurrence_ref: `occ:${channel.toLowerCase()}:egress`,
    channel,
  }));
  assert.equal(occurrence.silent_failure_blocked_structurally, true);
  assert.equal(occurrence.provider_native_proven, false);
  assert.equal(occurrence.authority.provider_effect, false);
}

const inboundFax = compileCommunicationOccurrence(base({
  occurrence_ref: 'occ:fax:ingress',
  direction: 'INGRESS',
  channel: 'FAX',
  state: 'RECEIVED',
  terminal: false,
  effect_state: 'NOT_ATTEMPTED',
  effect_receipt_ref: null,
  provider_receipt_ref: 'fax-provider-event:123',
}));
assert.equal(inboundFax.direction, 'INGRESS');
assert.equal(inboundFax.channel, 'FAX');
assert.equal(inboundFax.provider_receipt_state, 'SUPPLIED_UNVERIFIED');

const uncertainVoip = compileCommunicationOccurrence(base({
  occurrence_ref: 'occ:voip:unknown',
  channel: 'VOIP_CALL',
  state: 'UNKNOWN',
  terminal: false,
  effect_state: 'UNKNOWN',
  provider_receipt_ref: null,
  reconciliation_ref: 'reconcile:voip:001',
  wake_ref: 'wake:voip:001',
}));
assert.equal(uncertainVoip.disposition, 'RECONCILIATION_REQUIRED');

assert.throws(
  () => compileCommunicationOccurrence(base({ observation_receipt_ref: null })),
  /OBSERVATION_RECEIPT_REQUIRED/,
);

assert.throws(
  () => compileCommunicationOccurrence(base({ provider_receipt_ref: null })),
  /PROVIDER_RECEIPT_REQUIRED_FOR_PERFORMED/,
);

assert.throws(
  () => compileCommunicationOccurrence(base({
    occurrence_ref: 'occ:fax:missing-provider',
    direction: 'INGRESS',
    channel: 'FAX',
    state: 'RECEIVED',
    terminal: false,
    effect_state: 'NOT_ATTEMPTED',
    effect_receipt_ref: null,
    provider_receipt_ref: null,
  })),
  /INGRESS_PROVIDER_RECEIPT_REQUIRED/,
);

assert.throws(
  () => compileCommunicationOccurrence(base({
    occurrence_ref: 'occ:voip:silent-unknown',
    channel: 'VOIP_CALL',
    state: 'UNKNOWN',
    terminal: false,
    effect_state: 'UNKNOWN',
    provider_receipt_ref: null,
    reconciliation_ref: null,
    wake_ref: null,
  })),
  /UNKNOWN_REQUIRES_RECONCILIATION_AND_WAKE/,
);

assert.throws(
  () => compileCommunicationOccurrence(base({
    occurrence_ref: 'occ:fax:failed-silent',
    channel: 'FAX',
    state: 'FAILED',
    terminal: true,
    effect_state: 'NOT_PERFORMED',
    provider_receipt_ref: null,
    error_code: null,
    wake_ref: null,
  })),
  /FAILED_REQUIRES_ERROR_AND_WAKE/,
);

assert.throws(
  () => compileCommunicationOccurrence(base({ channel: 'FUTURE_UNREGISTERED_CHANNEL' })),
  /CHANNEL_UNREGISTERED/,
);

const retro = auditCommunicationHistory({
  occurrences: [
    base({ occurrence_ref: 'occ:history:good' }),
    base({ occurrence_ref: 'occ:history:bad', observation_receipt_ref: null }),
  ],
});
assert.equal(retro.observed_count, 2);
assert.equal(retro.receipted_count, 1);
assert.equal(retro.gap_count, 1);
assert.equal(retro.gaps[0].disposition, 'RETROACTIVE_RECONCILIATION_REQUIRED');
assert.equal(retro.closure_100, false);

const ledger = compileCommunicationLedger({
  ledger_ref: 'ledger:test',
  occurrences: [
    base({ occurrence_ref: 'occ:ledger:email', channel: 'EMAIL' }),
    base({ occurrence_ref: 'occ:ledger:fax', channel: 'FAX' }),
  ],
});
assert.equal(ledger.occurrence_count, 2);
assert.equal(ledger.by_channel.EMAIL, 1);
assert.equal(ledger.by_channel.FAX, 1);
assert.equal(ledger.silent_failure_allowed, false);

console.log(JSON.stringify({
  verdict: 'SOURCE_CONTRACT_PASS',
  change_unit: 'COMMUNICATION-RECEIPTS-001A',
  channels: COMMUNICATION_CHANNELS.length,
  requirements_per_channel: RECEIPT_REQUIREMENTS.length,
  cells: hundreds.cells.length,
  provider_effects: 0,
  external_communications: 0,
}));
