#!/usr/bin/env node
import assert from 'node:assert/strict';
import {compileVersionedConsentGate, compileLeaseConsentGate} from '../src/documents/versioned-consent.mjs';

const baseline = {canonicalRef:'document:fixture', canonicalGeneration:'revision:g1'};
const defaultGate = compileVersionedConsentGate(baseline);
assert.equal(defaultGate.status,'BLOCKED_CANONICAL_UNAVAILABLE');
assert.equal(defaultGate.signing_allowed,false);

const noSigner = compileVersionedConsentGate({...baseline,canonicalAvailable:true});
assert.equal(noSigner.status,'SIGNER_SELECTION_REQUIRED');
assert.equal(noSigner.next,'SELECT_SIGNER');
assert.equal(noSigner.signing_allowed,false);

const selected = compileVersionedConsentGate({...baseline,canonicalAvailable:true,signerRef:'principal:fixture'});
assert.equal(selected.status,'READY_TO_REVIEW_AND_SIGN');
assert.equal(selected.signing_allowed,true);
assert.equal(selected.signing_effect_authorized,false);
assert.equal(selected.authority_granted,false);
assert.equal(selected.provider_effect,false);
assert.equal(selected.verification_state,'SUPPLIED_UNVERIFIED');

const changed = compileVersionedConsentGate({...baseline,canonicalAvailable:true,signerRef:'principal:fixture',previousSignedGeneration:'revision:old',diffRef:'diff:fixture'});
assert.equal(changed.status,'CHANGE_REVIEW_REQUIRED');
assert.equal(changed.signing_allowed,false);
assert.equal(changed.diff_ref,'diff:fixture');

const unavailable = compileVersionedConsentGate({...baseline,canonicalAvailable:false,signerRef:'principal:fixture'});
assert.equal(unavailable.signing_allowed,false);
assert.equal(unavailable.next,'RECOVER_CANONICAL_SOURCE');

for (const [key,value] of [
  ['canonicalRef',{}],['canonicalGeneration',1],['signerRef',{}],
  ['previousSignedGeneration',false],['diffRef',[]],['documentKind',{}]
]) {
  assert.throws(()=>compileVersionedConsentGate({...baseline,[key]:value}),TypeError,`object/number coercion in ${key}`);
}

assert.equal(compileLeaseConsentGate({...baseline,canonicalAvailable:true,signerRef:'principal:fixture'}).document_kind,'lease');
console.log(JSON.stringify({state:'PASS',cases:12,effect_authority:0}));
