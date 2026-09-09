import crypto from 'node:crypto';
import { validateDistributedAck } from '../acks/distributed.mjs';

const TRANSPORTS = new Set(['SLACK','GITHUB_COMMENT','INBOX_LOCAL','SMTP']);
const STATES = new Set(['UNPROVEN','REGISTERED','DISPATCHED','DELIVERED','READ_BACK']);
const text = (v) => String(v ?? '').trim();
const bool = (v) => v === true;

function required(v, code) {
  const out = text(v);
  if (!out) throw new Error(code);
  return out;
}

function stableId(parts) {
  return crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 24);
}

export function compileInternalAgentEndpoint(input = {}) {
  const principalRef = required(input.principal_ref, 'PRINCIPAL_REF_REQUIRED');
  const address = required(input.address, 'ADDRESS_REQUIRED').toLowerCase();
  if (!address.includes('@') || address.startsWith('@') || address.endsWith('@')) throw new Error('ADDRESS_INVALID');
  const transport = required(input.transport, 'TRANSPORT_REQUIRED').toUpperCase();
  if (!TRANSPORTS.has(transport)) throw new Error('TRANSPORT_INVALID');
  const state = required(input.state || 'UNPROVEN', 'STATE_REQUIRED').toUpperCase();
  if (!STATES.has(state)) throw new Error('STATE_INVALID');
  const providerReceiptRef = text(input.provider_receipt_ref) || null;
  if (['DELIVERED','READ_BACK'].includes(state) && !providerReceiptRef) throw new Error('PROVIDER_RECEIPT_REQUIRED');
  if (transport === 'SMTP' && state !== 'UNPROVEN' && !providerReceiptRef) throw new Error('SMTP_PROVIDER_RECEIPT_REQUIRED');
  return Object.freeze({
    schema: 'xiio.sdk.internal-agent-endpoint/v1',
    endpoint_ref: `agent-endpoint:${stableId([principalRef,address,transport])}`,
    principal_ref: principalRef,
    address,
    domain: address.split('@').pop(),
    transport,
    state,
    provider_receipt_ref: providerReceiptRef,
    provider_native_proven: bool(providerReceiptRef),
    effect_authority: false,
  });
}

export function compileInternalAgentMessage(input = {}) {
  const ack = input.ack;
  const ackResult = validateDistributedAck(ack);
  if (!ackResult.ok) throw new Error(`ACK_INVALID:${ackResult.errors.join('|')}`);
  const sourceOccurrenceRef = required(input.source_occurrence_ref, 'SOURCE_OCCURRENCE_REF_REQUIRED');
  const subject = required(input.subject, 'SUBJECT_REQUIRED');
  const bodyRef = required(input.body_ref, 'BODY_REF_REQUIRED');
  const sender = compileInternalAgentEndpoint(input.sender);
  const recipients = (input.recipients || []).map(compileInternalAgentEndpoint);
  if (!recipients.length) throw new Error('RECIPIENT_REQUIRED');
  const messageId = `msg_${stableId([ack.ack_id,sourceOccurrenceRef,sender.endpoint_ref,...recipients.map(r=>r.endpoint_ref).sort()])}`;
  const providerDelivered = recipients.every(r => r.state === 'DELIVERED' || r.state === 'READ_BACK');
  const providerReadBack = recipients.every(r => r.state === 'READ_BACK');
  return Object.freeze({
    schema: 'xiio.sdk.internal-agent-message/v1',
    message_id: messageId,
    ack_id: ack.ack_id,
    root_ref: ack.root_ref,
    work_ref: ack.work_ref,
    source_occurrence_ref: sourceOccurrenceRef,
    subject,
    body_ref: bodyRef,
    sender,
    recipients,
    transport_summary: {
      provider_delivered: providerDelivered,
      provider_readback: providerReadBack,
      smtp_proven: recipients.filter(r=>r.transport==='SMTP').every(r=>r.provider_native_proven),
    },
    authority: { provider_write:false, work_assignment:false, legal_effect:false },
    hard: [
      'LOGICAL_ADDRESS!=SMTP_DELIVERY',
      'REGISTERED!=DELIVERED',
      'MESSAGE_ID!=PROVIDER_RECEIPT',
      'ACK_STRUCTURAL!=AUTHENTICATED',
      'SLACK_DISCOVERABLE!=SUBDOMAIN_EMAIL_PROVEN',
    ],
  });
}
