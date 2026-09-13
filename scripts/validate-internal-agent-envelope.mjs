#!/usr/bin/env node
import assert from 'node:assert/strict';
import { validateDistributedAck, makeAckSourceBinding } from '../src/acks/distributed.mjs';
import { compileInternalAgentEndpoint, compileInternalAgentMessage } from '../src/mail/internal-agent-envelope.mjs';

const sourceBinding=makeAckSourceBinding({
  source_ref:'resource:xiio:truth:gemini-v2',
  source_projection_ref:'gdrive:file:1tFQs2SDuUeBN7-mkrvj_mgkFmG_LvRjqdk0B0XNEQX0#tab=Gemini',
  source_projection_provider:'google_drive',
  source_projection_generation:'ANLCKQ_POST_EDIT_CANONICAL_R1_3342b361e46767a853f8399d',
  source_access_ref:'adapter:google-drive:read',
  source_currentness_receipt_ref:'receipt:drive:gemini-v2-current',
});
const ack={
  ack_id:'ack:truth:001',root_ref:'xiio-root:truth:gemini-v2',work_ref:'work:truth:gemini-v2',
  baseline_generation:'truth:g0',target_ref:'agent:chatgpt',provider_family:'internal-mail',
  agent_ref:'agent:chatgpt',capability_profile_ref:'sdk:internal-mail-v1',subject_generation:'truth:g1',
  effect_ceiling:'NO_EFFECT',ack_state:'ACK',attempt:0,return_target_ref:'xiio-root:truth:gemini-v2',
  observed_at:'2026-09-09T09:15:00-06:00',
  ...sourceBinding,
};

const ackValidation=validateDistributedAck(ack);
assert.equal(ackValidation.ok,true);
assert.equal(ackValidation.source_binding.bound,true);
assert.equal(ackValidation.source_binding.proof_state,'SUPPLIED_UNVERIFIED');
assert.equal(ackValidation.source_binding.currentness_state,'SUPPLIED_UNVERIFIED');
assert.equal(ackValidation.source_binding.access_state,'SUPPLIED_UNVERIFIED');
assert.equal(ackValidation.authority_granted,false);
assert.ok(ackValidation.hard.includes('GOOGLE_DRIVE_PROJECTION != CANONICAL_SOURCE_IDENTITY'));

// A distributed ACK without a usable source projection is structurally incomplete.
const sourceLess={...ack};
for (const field of [
  'source_ref','source_projection_ref','source_projection_provider','source_projection_generation',
  'source_access_ref','source_currentness_receipt_ref',
]) delete sourceLess[field];
const sourceLessValidation=validateDistributedAck(sourceLess);
assert.equal(sourceLessValidation.ok,false);
assert(sourceLessValidation.errors.some((entry)=>entry.includes('SOURCE_BINDING_REQUIRED')));
assert.equal(sourceLessValidation.source_binding.bound,false);
assert.throws(()=>compileInternalAgentMessage({
  ack:sourceLess,
  source_occurrence_ref:'resource:occurrence:source-less',
  subject:'source-less ACK must fail',
  body_ref:'resource:body:source-less',
  sender:{principal_ref:'agent:chatgpt',address:'chatgpt_agent@r1-lane.xi-io.com',transport:'SLACK',state:'REGISTERED'},
  recipients:[{principal_ref:'agent:cursor',address:'cursor_agent@r1-lane.xi-io.com',transport:'SLACK',state:'REGISTERED'}],
}),/ACK_INVALID/);

const slackEndpoint=compileInternalAgentEndpoint({
  principal_ref:'agent:chatgpt',address:'chatgpt_agent@r1-lane.xi-io.com',transport:'SLACK',state:'REGISTERED'
});
assert.equal(slackEndpoint.provider_native_proven,false);
assert.equal(slackEndpoint.provider_receipt_state,'NONE');
assert.equal(slackEndpoint.provider_verified_state,'UNPROVEN');

assert.throws(()=>compileInternalAgentEndpoint({
  principal_ref:'agent:chatgpt',address:'chatgpt_agent@r1-lane.xi-io.com',transport:'SMTP',state:'DELIVERED'
}),/PROVIDER_RECEIPT_REQUIRED|SMTP_PROVIDER_RECEIPT_REQUIRED/);

const smtpUnproven=compileInternalAgentEndpoint({
  principal_ref:'agent:chatgpt',address:'chatgpt_agent@r1-lane.xi-io.com',transport:'SMTP',state:'UNPROVEN'
});
assert.equal(smtpUnproven.provider_native_proven,false);

const message=compileInternalAgentMessage({
  ack,
  source_occurrence_ref:'resource:occurrence:truth-g1',
  subject:'@!TRUTH gemini v2 result',
  body_ref:'resource:body:truth-loop',
  sender:{principal_ref:'agent:chatgpt',address:'chatgpt_agent@r1-lane.xi-io.com',transport:'SLACK',state:'REGISTERED'},
  recipients:[
    {principal_ref:'agent:cursor',address:'cursor_agent@r1-lane.xi-io.com',transport:'SLACK',state:'REGISTERED'},
    {principal_ref:'agent:gemini',address:'gemini_agent@r1-lane.xi-io.com',transport:'SMTP',state:'UNPROVEN'},
  ],
});
assert.match(message.message_id,/^msg_[0-9a-f]{24}$/);
assert.equal(message.transport_summary.provider_delivered,false);
assert.equal(message.transport_summary.provider_readback,false);
assert.equal(message.transport_summary.smtp_proven,false);
assert.equal(message.authority.provider_write,false);
assert.ok(message.hard.includes('SLACK_DISCOVERABLE!=SUBDOMAIN_EMAIL_PROVEN'));
assert.ok(message.hard.includes('PROVIDER_RECEIPT_REF!=PROVIDER_NATIVE_PROOF'));

const suppliedReceiptClaims=compileInternalAgentMessage({
  ack:{...ack,ack_id:'ack:truth:002'},
  source_occurrence_ref:'resource:occurrence:truth-g2',
  subject:'caller supplied provider-looking refs',body_ref:'resource:receipt:truth:g2',
  sender:{principal_ref:'service:mail',address:'mail@r1-lane.xi-io.com',transport:'SMTP',state:'READ_BACK',provider_receipt_ref:'smtp:sender:g2'},
  recipients:[{principal_ref:'agent:gemini',address:'gemini_agent@r1-lane.xi-io.com',transport:'SMTP',state:'READ_BACK',provider_receipt_ref:'smtp:recipient:g2'}],
});
assert.equal(suppliedReceiptClaims.sender.declared_state,'READ_BACK');
assert.equal(suppliedReceiptClaims.sender.provider_receipt_state,'SUPPLIED_UNVERIFIED');
assert.equal(suppliedReceiptClaims.sender.provider_native_proven,false);
assert.equal(suppliedReceiptClaims.recipients[0].declared_state,'READ_BACK');
assert.equal(suppliedReceiptClaims.recipients[0].provider_receipt_state,'SUPPLIED_UNVERIFIED');
assert.equal(suppliedReceiptClaims.recipients[0].provider_native_proven,false);
assert.equal(suppliedReceiptClaims.transport_summary.provider_delivered_claimed,true);
assert.equal(suppliedReceiptClaims.transport_summary.provider_readback_claimed,true);
assert.equal(suppliedReceiptClaims.transport_summary.smtp_claimed,true);
assert.equal(suppliedReceiptClaims.transport_summary.provider_delivered,false);
assert.equal(suppliedReceiptClaims.transport_summary.provider_readback,false);
assert.equal(suppliedReceiptClaims.transport_summary.smtp_proven,false);
assert.equal(suppliedReceiptClaims.transport_summary.verification_state,'SUPPLIED_UNVERIFIED');

const forgedNativeLooking=compileInternalAgentEndpoint({
  principal_ref:'agent:forged',address:'forged@r1-lane.xi-io.com',transport:'SMTP',state:'READ_BACK',
  provider_receipt_ref:'ANLCKQ_POST_EDIT_CANONICAL_R1_3342b361e46767a853f8399d',
});
assert.equal(forgedNativeLooking.provider_native_proven,false);
assert.equal(forgedNativeLooking.provider_verified_state,'UNPROVEN');
assert.equal(forgedNativeLooking.provider_receipt_state,'SUPPLIED_UNVERIFIED');

console.log('INTERNAL_AGENT_ENVELOPE_PASS source_binding_required=1 source_projection_supplied_unverified=1 supplied_receipt_never_provider_verified=1 claimed_vs_verified_split=1 arbitrary_provider_looking_ref_rejected_as_proof=1 effects=0');
