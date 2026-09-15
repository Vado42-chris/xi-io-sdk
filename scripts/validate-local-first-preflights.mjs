#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileLocalAckFirstPreflight } from '../src/acks/local-first.mjs';
import { normalizeHostedRunnerObservation, normalizeProviderFailure } from '../src/providers/state.mjs';
import { compileLeaseConsentGate } from '../src/documents/versioned-consent.mjs';

const githubBillingMessage = 'The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the Billing & plans section in your settings';
const providerHold = normalizeHostedRunnerObservation({
  provider:'GitHub Actions', conclusion:'failure', runner_id:0, steps:[], provider_message:githubBillingMessage,
});
assert.equal(providerHold.admission_state,'HOLD_PROVIDER_BILLING');

const blockedLocal = compileLocalAckFirstPreflight({
  localRuntime:'UNKNOWN', localAck:'NO', localSimulation:'NOT_RUN',
  localExecutor:'UNKNOWN', localExecutorReadback:'UNKNOWN', cordFree:false, ownerPathIndependent:false,
  automaticCloudFallback:true,
  crmCurrent:false, hvtSelected:false,
  externalProjectionRequested:true, remoteExecutorState:providerHold.admission_state,
});
assert.equal(blockedLocal.status,'WAIT_LOCAL_FIRST');
assert.equal(blockedLocal.external_projection_allowed,false);
assert.equal(blockedLocal.owner_relay_required,false);
assert.equal(blockedLocal.remote_executor_eligible,false);
assert.equal(blockedLocal.remote_requalification_required,true);
assert.ok(blockedLocal.blockers.includes('LOCAL_ACK_MISSING'));
assert.ok(blockedLocal.blockers.includes('CORD_FREE_OLLAMA_EXECUTOR_UNBOUND'));
assert.ok(blockedLocal.blockers.includes('CORD_FREE_OLLAMA_READBACK_MISSING'));
assert.ok(blockedLocal.blockers.includes('OWNER_CORD_DEPENDENCY_PRESENT'));
assert.ok(blockedLocal.blockers.includes('OWNER_PATH_DEPENDENCY_PRESENT'));
assert.ok(blockedLocal.blockers.includes('AUTOMATIC_CLOUD_FALLBACK_FORBIDDEN'));
assert.ok(blockedLocal.notices.includes('REMOTE_EXECUTOR_BLOCKED_USE_LOCAL_SIBLINGS'));

const cursorFailure = normalizeProviderFailure({
  provider:'Cursor', operation:'cloud_agent_job_start', provider_message:githubBillingMessage,
});
assert.equal(cursorFailure.operation_state,'BLOCKED_PROVIDER_BILLING');
const cursorLocalFirst = compileLocalAckFirstPreflight({
  localRuntime:'BOUND', localAck:'YES', localSimulation:'PASS',
  localExecutor:'ZED_ACP_OLLAMA', localExecutorReadback:'PASS', cordFree:true, ownerPathIndependent:true,
  automaticCloudFallback:false,
  crmCurrent:true, hvtSelected:true,
  externalProjectionRequested:false, remoteExecutorState:cursorFailure.operation_state,
});
assert.equal(cursorLocalFirst.status,'LOCAL_READY');
assert.equal(cursorLocalFirst.local_executor,'ZED_ACP_OLLAMA');
assert.equal(cursorLocalFirst.cord_free,true);
assert.equal(cursorLocalFirst.owner_path_independent,true);
assert.equal(cursorLocalFirst.automatic_cloud_fallback,false);
assert.equal(cursorLocalFirst.remote_executor_eligible,false);
assert.equal(cursorLocalFirst.remote_requalification_required,true);
assert.ok(cursorLocalFirst.notices.includes('REMOTE_EXECUTOR_BLOCKED_USE_LOCAL_SIBLINGS'));
assert.equal(cursorLocalFirst.next,'EXECUTE_LOCAL_OR_RETURN_TYPED_WAIT');

const localReady = compileLocalAckFirstPreflight({
  localRuntime:'BOUND', localAck:'YES', localSimulation:'PASS',
  localExecutor:'OLLAMA', localExecutorReadback:'READBACK_PASS', cordFree:true, ownerPathIndependent:true,
  automaticCloudFallback:false,
  crmCurrent:true, hvtSelected:true,
  externalProjectionRequested:false, remoteExecutorState:providerHold.admission_state,
});
assert.equal(localReady.status,'LOCAL_READY');
assert.equal(localReady.local_ready,true);
assert.equal(localReady.remote_executor_eligible,false);
assert.equal(localReady.next,'EXECUTE_LOCAL_OR_RETURN_TYPED_WAIT');

const rawLocalButCorded = compileLocalAckFirstPreflight({
  localRuntime:'BOUND', localAck:'YES', localSimulation:'PASS',
  localExecutor:'OLLAMA', localExecutorReadback:'PASS', cordFree:false, ownerPathIndependent:false,
  automaticCloudFallback:false,
  crmCurrent:true, hvtSelected:true,
});
assert.equal(rawLocalButCorded.status,'WAIT_LOCAL_FIRST');
assert.ok(rawLocalButCorded.blockers.includes('OWNER_CORD_DEPENDENCY_PRESENT'));
assert.ok(rawLocalButCorded.blockers.includes('OWNER_PATH_DEPENDENCY_PRESENT'));

const cloudFallbackHostile = compileLocalAckFirstPreflight({
  localRuntime:'BOUND', localAck:'YES', localSimulation:'PASS',
  localExecutor:'ZED_ACP_OLLAMA', localExecutorReadback:'PASS', cordFree:true, ownerPathIndependent:true,
  automaticCloudFallback:true,
  crmCurrent:true, hvtSelected:true,
});
assert.equal(cloudFallbackHostile.status,'WAIT_LOCAL_FIRST');
assert.ok(cloudFallbackHostile.blockers.includes('AUTOMATIC_CLOUD_FALLBACK_FORBIDDEN'));

const wrongExecutor = compileLocalAckFirstPreflight({
  localRuntime:'BOUND', localAck:'YES', localSimulation:'PASS',
  localExecutor:'OPENAI', localExecutorReadback:'PASS', cordFree:true, ownerPathIndependent:true,
  automaticCloudFallback:false,
  crmCurrent:true, hvtSelected:true,
});
assert.equal(wrongExecutor.status,'WAIT_LOCAL_FIRST');
assert.ok(wrongExecutor.blockers.includes('CORD_FREE_OLLAMA_EXECUTOR_UNBOUND'));

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

console.log('LOCAL_FIRST_PREFLIGHTS_PASS cord_free_ollama_root_gate=1 zed_acp_ollama=1 automatic_cloud_fallback=0 owner_path_dependency=0 accepted_provider_preflight=1 remote_eligible_false=1 local_ack_first=1 versioned_lease_consent=1 effects=0');
