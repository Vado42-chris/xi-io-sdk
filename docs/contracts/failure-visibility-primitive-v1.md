# Failure Visibility Primitive v1

Date: 2026-09-27
Status: mandatory adoption contract
Origin: xi-io FailureAtom v1 exists as documentation-only; this contract closes the cross-product visibility/adoption seam.

## Invariant

NO FAILURE MAY BECOME LESS SPECIFIC, LESS VISIBLE, OR LESS ACTIONABLE AS IT CROSSES A LAYER.

A failure is conserved until it is independently verified healed.

FAILURE != TOAST.
HTTP_ERROR != GENERIC_FAILURE.
UNKNOWN != SUCCESS.
RETRY != HEAL.
RECEIPT != READBACK.
CONTRACT_EXISTS != RUNTIME_ADOPTED.

## Canonical failure visibility envelope

failure_ref
correlation_ref
subject_ref
operation_ref
source_layer
source_generation
timestamp
failure_class
failure_subclass
protocol
status_code
provider_code
safe_message
raw_evidence_ref
raw_evidence_preserved
payload_size_observed
payload_limit_observed
attempted
effect_state
retryable
retry_count
idempotency_ref
affected_refs[]
blocked_refs[]
independent_refs[]
privacy_level
authority_ceiling
unknowns[]
receipt_ref
readback_ref
resume_target
delivered=false

Fields unsupported by evidence MUST be UNKNOWN/null, never invented.

## Required crossings

RAW FAILURE
→ FailureAtom / visibility envelope
→ SDK semantic operation return
→ Article semantic preservation
→ Publisher projection recipe
→ target adapter
→ Ward policy/admission
→ HEX/Studio user-visible state
→ @ibal formation
→ affectedness / PNEUMA
→ repair
→ independent readback
→ DELIVERED only after proof

Every crossing MUST preserve failure_ref + correlation_ref + class + effect_state + unknowns + evidence ref.

## Required user projection

Every interactive surface must provide:
- concise failure state at point of action;
- stable correlation/reference;
- whether the attempted effect happened;
- whether user input is preserved;
- retry state;
- next safe machine action when derivable;
- diagnostics/detail expansion for SIVER/GOLD;
- no success language without effect/readback.

BRONZE: what failed + whether work/input is safe.
SIVER: stage, retry/blocker, affected work, correlation.
GOLD: raw-safe evidence refs, provider/status codes, generation, authority, receipts, readback, dependency cone.

## HTTP 413 positive-control fixture

Observed class: HTTP_PAYLOAD_TOO_LARGE
status_code: 413
attempted: true
effect_state: NOT_PROVEN
user_input_preserved: REQUIRED
conversation_history_preserved: REQUIRED
retry: MUST NOT blindly duplicate send
repair candidate: bounded context projection/compaction
raw durable history: MUST NOT be deleted merely to shrink model context
exact failing hop/limit: UNKNOWN until instrumented

A surface that converts this to "Request failed" without retaining 413/correlation/effect state FAILS adoption.

## Adoption gate

A product is not compliant because this file exists.

PASS requires:
1. fixture injected at product ingress;
2. typed failure survives every crossing;
3. user surface renders it;
4. @ibal receives it without asking owner what happened;
5. affectedness routes independent work;
6. repair produces receipt;
7. independent readback proves state;
8. only then may failure close.

Silent catch, empty catch, console-only failure, generic toast, dropped promise rejection, untyped 5xx, or swallowed provider error are RED.

## AI_OFF

Failure capture, classification transport, conservation, projection and admission MUST work without an AI. AI may explain or propose repair but cannot be required to preserve the failure.

## PNEUMA

Failure is routing information, not global stop.
Block only true dependency cone.
Keep independent work running.
Failure remains in denominator until healed + read back.
