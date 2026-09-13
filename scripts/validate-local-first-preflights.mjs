#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileLocalAckFirstPreflight } from '../src/acks/local-first.mjs';
import { normalizeHostedRunnerObservation } from '../src/providers/state.mjs';
import { compileLeaseConsentGate } from '../src/documents/versioned-consent.mjs';

const githubBillingMessage = 'The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the Billing & plans section in your settings';
const providerHold = normalizeHostedRunnerObservation({
  provider:'GitHub Actions', conclusion:'failure', runner_id:0, steps:[], provider_message:githubBillingMessage,
});
assert.equal(providerHold.admission_state,'HOLD_PROVIDER_BILLING');

const blockedLocal = compileLocalAckFirstPreflight({
  localRuntime:'UNKNOWN', localAck:'NO', localSimulation:'NOT_RUN', crmCurrent:false, hvtSelected:false,
  externalProjectionRequested:true, remoteExecutorState:providerHold.admission_state,
});
assert.equal(blockedLocal.status,'WAIT_LOCAL_FIRST');
assert.equal(blockedLocal.external_projection_allowed,false);
assert.equal(blockedLocal.owner_relay_required,false);
assert.ok(blockedLocal.blockers.includes('LOCAL_ACK_MISSING'));
assert.ok(blockedLocal.notices.includes('REMOTE_EXECUTOR_BLOCKED_USE_LOCAL_SIBLINGS'));

const localReady = compileLocalAckFirstPreflight({
  localRuntime:'BOUND', localAck:'YES', localSimulation:'PASS', crmCurrent:true, hvtSelected:true,
  externalProjectionRequested:false, remoteExecutorState:providerHold.admission_state,
});
assert.equal(localReady.status,'LOCAL_READY');
assert.equal(localReady.local_ready,true);
assert.equal(localReady.next,'EXECUTE_LOCAL_OR_RETURN_TYPED_WAIT');

const firstLease = compileLeaseConsentGate({
  canonicalRef:'drive:lease-core', canonicalGeneration:'g1', signerRef:'tenant:cary',
});
assert.equal(firstLease.status,'READY_TO_REVIEW_AND_SIGN');
assert.equal(firstLease.signing_allowed,true);
assert.equal(firstLease.first_signing,true);

const changedLease = compileLeaseConsentGate({
  canonicalRef:'drive:lease-core', canonicalGeneration:'g2', previousSignedGeneration:'g1',
  signerRef:'tenant:cary', diffRef:'diff:g1..g2',
});
assert.equal(changedLease.status,'CHANGE_REVIEW_REQUIRED');
assert.equal(changedLease.signing_allowed,false);
assert.equal(changedLease.changed_since_previous_signing,true);
assert.ok(changedLease.display_requirements.includes('SHOW_DIFF_OR_CHANGE_SUMMARY_BEFORE_SIGNING'));

const sameLease = compileLeaseConsentGate({
  canonicalRef:'drive:lease-core', canonicalGeneration:'g2', previousSignedGeneration:'g2', signerRef:'tenant:cary',
});
assert.equal(sameLease.status,'READY_TO_REVIEW_AND_SIGN');
assert.equal(sameLease.signing_allowed,true);

console.log('LOCAL_FIRST_PREFLIGHTS_PASS accepted_provider_preflight=1 local_ack_first=1 versioned_lease_consent=1 effects=0');
