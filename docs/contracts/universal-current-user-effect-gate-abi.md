# Universal Current-User Effect Gate ABI

Status: public-safe SDK candidate contract
Scope: provider-neutral effect-gating metadata for SDK/ACK/internal-agent projections.

## Purpose

Separate non-consequential preparation from consequential effects across every SDK-facing surface.

Core rule:

DRAFT / PLAN / PROPOSE / PREPARE = non-consequential preparation.
CONSEQUENTIAL EFFECT = WAIT until an explicit CURRENT user instruction is bound to the exact occurrence and exact requested effect.

Prior approval does not persist or replay.

Current user instruction is a required gate only. It does not mint effect authority. Ward, Switchboard, qualification, admission, provider policy, product policy and domain-specific legal/security gates remain separate.

## Universal scopes

EXTERNAL
INTERNAL
INTER_APP
INTER_DEPARTMENT
API
SDK
ACK
PROVIDER
CRM
SWITCHBOARD
REPOSITORY
DEPLOYMENT
MESSAGE
FILE_MUTATION
OTHER_CONSEQUENTIAL

## Required policy fields

schema
effect_scope
consequential
occurrence_ref
requested_effect_ref
current_instruction_ref
authorizing_instruction_ref
authorized_effect_refs[]
draft_plan_propose_prepare_allowed
user_effect_instruction_bound
effect_attempt_eligible
effect_authority
approval_persists
prior_approval_replay_allowed

## Invariants

CURRENT_USER_INSTRUCTION != EFFECT_AUTHORITY
ACK != EFFECT_AUTHORITY
SDK_OUTPUT != EFFECT_AUTHORITY
CURRENT_INSTRUCTION_REF_MATCH != EFFECT_MATCH
EXACT REQUESTED EFFECT MUST APPEAR IN authorized_effect_refs[]
PRIOR APPROVAL != CURRENT EFFECT GATE
DRAFT != SEND
PLAN != DEPLOY
PROPOSE != MUTATE
PREPARE != PROVIDER WRITE
INTERNAL EFFECT != EXEMPT
EXTERNAL EFFECT != SPECIAL CASE

## Required hostile cases

1. exact current instruction + exact occurrence + exact effect ref -> user gate bound; effect authority remains false.
2. prior/different instruction -> WAIT.
3. same instruction but different effect ref -> WAIT.
4. missing occurrence ref -> WAIT.
5. missing requested effect ref -> WAIT.
6. missing policy -> FAIL structural validation.
7. caller sets effect_authority=true -> FAIL.
8. non-consequential preparation -> allowed as NO_EFFECT, no attempt eligibility.

## Ownership

SDK owns only public-safe shape/validation/projection.
Framework instruction custody owns current-instruction provenance/correlation.
Ward/Switchboard/domain owners retain consequential-effect authority and admission.

## Runtime proof

Candidate branch hostiles cover all 15 scopes.
SDK GitHub Actions Check and Local Static Scan passed on the exact candidate head after affected internal-agent and baseline-CLI consumers were patched.

No private case payload is required or permitted for this contract.
