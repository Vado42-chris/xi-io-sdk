# ROTFL Binary Variable + Invariant ABI

Status: reusable public-safe SDK contract
Scope: white-label state representation for ROTFL skills, lessons, department heads, projections, canaries, miners, requirements, reviews, release gates, and adopters

## Core rule

All machine-evaluated variables and invariants are represented as binary signals.

Binary representation MUST NOT collapse `UNKNOWN` into false.

A truth-bearing cell uses a masked two-bit shape:

```text
KNOWN_BIT : 0 | 1
VALUE_BIT : 0 | 1
```

Semantics:

```text
KNOWN=0, VALUE=0 -> UNKNOWN; VALUE is masked and has no truth meaning
KNOWN=0, VALUE=1 -> INVALID REPRESENTATION; normalize/reject rather than infer truth
KNOWN=1, VALUE=0 -> known false / failed / absent / not satisfied
KNOWN=1, VALUE=1 -> known true / passed / present / satisfied
```

Hard:

```text
UNKNOWN != FALSE
UNKNOWN != PASS
NOT_EXECUTED != FAIL
NOT_REQUIRED != PASS
PRESENT != CURRENT
CURRENT != VERIFIED
VERIFIED != AUTHORIZED
AUTHORIZED != EXECUTED
EXECUTED != ACCEPTED
```

## Binary variable cell

A reusable variable cell is a bit vector plus non-authoritative metadata:

```text
VARIABLE_ID
KNOWN_BIT
VALUE_BIT
REQUIRED_BIT
CURRENT_BIT
SOURCE_BOUND_BIT
OWNER_ADOPTED_BIT
EFFECT_AUTHORIZED_BIT
CHANGED_BIT
```

Every field ending `_BIT` is exactly `0|1`.

Metadata such as source refs, timestamps, reason codes, owner refs, units, labels, and human-readable explanations are evidence/provenance. They do not replace the binary state.

## Invariant cell

An invariant is evaluated as a predicate over binary cells and returns the same masked shape:

```text
INVARIANT_ID
KNOWN_BIT
VALUE_BIT
```

Release credit exists only when:

```text
KNOWN_BIT=1 AND VALUE_BIT=1
```

An unevaluable invariant returns `KNOWN_BIT=0`, never synthetic PASS or FAIL.

## Multi-state values

Enumerations use one-hot bit vectors rather than prose as machine truth.

Example event state:

```text
PREPARED_BIT
OWNER_ADOPTED_BIT
SWORN_BIT
TRANSMITTED_BIT
SERVED_BIT
SERVICE_PROVED_BIT
FILED_BIT
ACCEPTED_BIT
```

The governing contract defines whether states are cumulative, mutually exclusive, or monotonic.

Example disposition:

```text
ANSWERED_BIT
RESPONDED_SEPARATELY_BIT
SUPERSEDED_BIT
DEFERRED_BIT
NO_RESPONSE_REQUIRED_BIT
UNKNOWN_BLOCKS_RELEASE_BIT
```

For a single-choice disposition exactly one known disposition bit may be active. Conflicting active bits fail validation.

## Requirement stickiness

Every user/product/editorial/legal/technical requirement that enters an admitted work unit receives a stable requirement identity and binary cells.

Minimum requirement vector:

```text
REQUIREMENT_PRESENT_BIT
REQUIREMENT_CURRENT_BIT
REQUIREMENT_REQUIRED_BIT
REQUIREMENT_SOURCE_BOUND_BIT
REQUIREMENT_SATISFIED_KNOWN_BIT
REQUIREMENT_SATISFIED_VALUE_BIT
REQUIREMENT_CHANGED_BIT
REQUIREMENT_EXPLICITLY_SUPERSEDED_BIT
```

Hard:

```text
EDIT_IMPROVEMENT != REQUIREMENT_SATISFACTION
BEAUTIFUL_OUTPUT != BRIEF_CONFORMANCE
REVISION != PERMISSION_TO_DROP_REQUIREMENT
OMISSION != SUPERSESSION
```

A requirement may leave the active denominator only through an explicit supersession/change event with provenance. Silence, compression, rewrite, summarization, design polish, or model preference cannot remove it.

## Requirement counterpunch / drift test

Before a HOT_PATCH is accepted into a revision, the foreman recomputes the complete current requirement denominator.

For every current required item:

```text
PRESENT_BIT = 1
CURRENT_BIT = 1
REQUIRED_BIT = 1
SATISFIED_KNOWN_BIT = 1
SATISFIED_VALUE_BIT = 1
```

Otherwise the patch/revision carries a named blocker.

This makes requirements the counterpunch against local optimization drift: prose can improve, UI can improve, rendering can improve, and architecture can improve only if the full accepted requirement vector remains satisfied or an explicit owner/source change updates the denominator.

## Patch impact vector

Every HOT_PATCH carries binary impact signals for each affected requirement and consumer:

```text
TOUCHED_BIT
PRESERVED_BIT
IMPROVED_BIT
REGRESSED_BIT
REQUIRES_REVIEW_BIT
```

`REGRESSED_BIT=1` blocks foreman APPLY unless an explicitly authorized requirement change/supersession is part of the same accepted generation change.

Untouched is not assumed preserved when the patch changes a dependency that can affect the requirement. Dependency fan-out determines the affected set.

## Consumer and proof binding

For each consumer-facing claim/projection:

```text
CLAIM_PRESENT_BIT
CLAIM_SOURCE_BOUND_BIT
SOURCE_LOCATABLE_BIT
LIMITATION_VISIBLE_BIT
CONSUMER_ACTION_CLEAR_BIT
NEXT_STATE_CLEAR_BIT
```

A claim that exists but cannot lead the consumer to its proof has `CLAIM_PRESENT_BIT=1` and `SOURCE_LOCATABLE_BIT=0`; it cannot receive release credit.

## Canary/miner binary exit

Each canary/miner lane exposes:

```text
CANARY_TRIGGERED_BIT
NEW_CLASS_BIT
SHAFT_BOUND_BIT
PATCH_RETURNED_BIT
HOLD_RETURNED_BIT
FOREMAN_DISPOSITION_KNOWN_BIT
FOREMAN_APPLIED_BIT
```

Hard:

```text
CANARY_TRIGGERED=1 + NEW_CLASS=1 + SHAFT_BOUND=0 -> LOOP_INCOMPLETE
PATCH_RETURNED=0 + HOLD_RETURNED=0 -> LOOP_INCOMPLETE
FOREMAN_APPLIED=1 without FOREMAN_DISPOSITION_KNOWN=1 -> INVALID
```

## User × Experience decomposition binding

The white-label Socratic decomposition method is owned by
`docs/contracts/rotfl-user-experience-socratic-binary-decomposition-abi.md`.

This ABI supplies the masked binary cells used by that method. It does not duplicate the decomposition algorithm.

One additional evidence boundary remains explicit here:

```text
USER_REPORT_OF_EXPERIENCE = direct evidence of that User's experience
USER_REPORT_OF_EXPERIENCE != UNIVERSAL_DOMAIN_TRUTH
UX_MEASUREMENT != LEGAL / SECURITY / PROVIDER AUTHORITY
```

## Release bit

A release decision is derived, never declared by prose.

```text
RELEASE_KNOWN_BIT
RELEASE_VALUE_BIT
```

A release may be true only if every required release invariant is known true and every blocking denominator has zero unresolved required cells.

```text
RELEASE_VALUE_BIT = AND(required_known_true_invariants)
```

If any required invariant is unknown:

```text
RELEASE_KNOWN_BIT=0
```

not false-green and not synthetic failure.

## White-label use

This ABI is intentionally domain-neutral.

Examples:

- Articles: brief requirements, claims, sources, editorial feedback, tone, audience, SEO, CTA, rights, accessibility, publication state.
- Publisher: packet requirements, composition bindings, recipe constraints, target requirements, review responses, render validation, egress readiness.
- Desktop: workspace-role requirements, user handoffs, visibility, action clarity, evidence anchors, state/readback.
- Legal workflow: forms, response obligations, disclosure categories, oath/service/file/acceptance states, evidence/source bindings.
- Books/VeilRIFT: canon requirements, source/canon bindings, chapter/section obligations, editorial notes, reader navigation, art/rights requirements, layout/export readiness.
- Software/release: acceptance criteria, tests, dependencies, security gates, rollout/rollback/readback.

## Storage and transport

Binary vectors may be serialized as booleans, `0|1`, bitsets, masks, or packed integers if and only if the representation preserves:

- stable variable/invariant identity;
- UNKNOWN masking;
- exact denominator membership;
- generation/currentness;
- provenance pointers;
- no implicit PASS from absence.

Compression is an implementation choice. Semantics are invariant.

## Relationship to other ROTFL contracts

This ABI composes with:

- `docs/contracts/rotfl-department-head-manifest-skill-abi.md`
- `docs/contracts/rotfl-user-experience-socratic-binary-decomposition-abi.md`
- universal lesson promotion through `xi lesson promote`
- adopter-specific requirement/response denominators
- HOT_PATCH and foreman APPLY/HOLD/REJECT
- RETURN / APPLY_RETURN

The Socratic decomposition ABI uses these cells to reduce a User × Experience into the smallest sufficient evidence-producing questions while preserving the parent denominator.

The binary ABI owns representation and evaluation semantics. It does not own domain authority, source truth, worker admission, security policy, provider effects, or release authorization.
