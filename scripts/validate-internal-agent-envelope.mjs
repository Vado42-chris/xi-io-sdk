#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileInternalAgentEndpoint, compileInternalAgentMessage } from '../src/mail/internal-agent-envelope.mjs';

const ack={
  ack_id:'ack:truth:001',root_ref:'github:xi-io.net#794',work_ref:'work:truth:gemini-v2',
  baseline_generation:'truth:g0',target_ref:'agent:chatgpt',provider_family:'internal-mail',
  agent_ref:'agent:chatgpt',capability_profile_ref:'sdk:internal-mail-v1',subject_generation:'truth:g1',
  effect_ceiling:'NO_EFFECT',ack_state:'ACK',attempt:0,return_target_ref:'github:xi-io.net#794',
  observed_at:'2026-09-09T09:15:00-06:00',
};

const slackEndpoint=compileInternalAgentEndpoint({
  principal_ref:'agent:chatgpt',address:'chatgpt_agent@r1-lane.xi-io.com',transport:'SLACK',state:'REGISTERED'
});
assert.equal(slackEndpoint.provider_native_proven,false);

assert.throws(()=>compileInternalAgentEndpoint({
  principal_ref:'agent:chatgpt',address:'chatgpt_agent@r1-lane.xi-io.com',transport:'SMTP',state:'DELIVERED'
}),/PROVIDER_RECEIPT_REQUIRED|SMTP_PROVIDER_RECEIPT_REQUIRED/);

const smtpUnproven=compileInternalAgentEndpoint({
  principal_ref:'agent:chatgpt',address:'chatgpt_agent@r1-lane.xi-io.com',transport:'SMTP',state:'UNPROVEN'
});
assert.equal(smtpUnproven.provider_native_proven,false);

const message=compileInternalAgentMessage({
  ack,
  source_occurrence_ref:'github:xi-io.net#794@truth-g1',
  subject:'@!TRUTH gemini v2 result',
  body_ref:'github:xi-io.net#794#truth-loop',
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

const delivered=compileInternalAgentMessage({
  ack:{...ack,ack_id:'ack:truth:002'},
  source_occurrence_ref:'github:xi-io.net#794@truth-g2',
  subject:'provider proved message',body_ref:'receipt:truth:g2',
  sender:{principal_ref:'service:mail',address:'mail@r1-lane.xi-io.com',transport:'SMTP',state:'READ_BACK',provider_receipt_ref:'smtp:sender:g2'},
  recipients:[{principal_ref:'agent:gemini',address:'gemini_agent@r1-lane.xi-io.com',transport:'SMTP',state:'READ_BACK',provider_receipt_ref:'smtp:recipient:g2'}],
});
assert.equal(delivered.transport_summary.provider_delivered,true);
assert.equal(delivered.transport_summary.provider_readback,true);
assert.equal(delivered.transport_summary.smtp_proven,true);

console.log('INTERNAL_AGENT_ENVELOPE_PASS 8/8');
