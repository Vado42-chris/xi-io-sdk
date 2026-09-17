# ROTFL Serialized Semantic Event Chain ABI

Status: reusable public-safe SDK contract
Scope: white-label ordered state-transition envelope for CRM, agent/task history, conversation occurrences, binary invariants, metering, observers and adopter replay

## Purpose

This contract abstracts the useful core of serialized-hashtag / chained-ledger ideas into a provider-neutral event spine.

It is not a cryptocurrency, consensus network, financial blockchain, or authority system.

Its job is to make state transitions:

- ordered;
- addressable;
- replayable;
- tamper-evident within a recorded chain;
- binary-evaluable;
- attributable to stable actors/tasks/conversations;
- safe to aggregate into quality, cost, savings and later billing projections.

## Semantic anchor

A human-facing semantic tag may route to one stable typed identity.

```text
SEMANTIC_TAG -> TYPED_REF
```

Examples:

```text
#project/foo
#task/bar
#conversation/baz
#requirement/qux
#lesson/reuse
```

The tag is a route/alias only.

```text
HASHTAG != CANONICAL_IDENTITY
HASHTAG != AUTHORITY
HASHTAG != EVENT_RECEIPT
```

The typed ref is resolved by the owning registry/CRM/SDK/Rosetta owner.

## Event envelope

Every serialized semantic event uses one canonical envelope:

```text
schema
sequence
stream_ref
previous_event_hash
event_hash
observed_at
actor_ref
principal_ref
assignment_ref
work_ref
task_ref
project_ref
conversation_ref
message_ref
occurrence_ref
semantic_refs[]
source_generation
target_generation
event_type
binary_snapshot
binary_delta
source_refs[]
receipt_refs[]
parent_event_refs[]
effect_class
```

Only fields applicable to the event are populated. Missing optional refs remain absent/null; they are never fabricated.

## Hash rule

`event_hash` is calculated over the canonical serialized event content excluding `event_hash` itself.

The canonical payload MUST include `previous_event_hash`, `sequence`, `stream_ref`, identity refs, binary vectors, source generation and event type.

```text
EVENT_HASH = SHA256(CANONICAL_SERIALIZATION(EVENT_WITHOUT_EVENT_HASH))
```

A stream's first event uses an explicit genesis marker defined by the stream owner, e.g. `GENESIS`.

Hard:

```text
HASH_MATCH != SOURCE_TRUTH
HASH_MATCH != AUTHORITY
HASH_MATCH != PROVIDER_READBACK
HASH_CHAIN_VALID != EVENT_CONTENT_TRUE
```

The chain protects recorded ordering/integrity; separate evidence proves factual truth.

## Binary snapshot and delta

Binary semantics are owned by `docs/contracts/rotfl-binary-variable-invariant-abi.md`.

An event may carry:

```text
binary_snapshot: {
  <VARIABLE_ID>: { known_bit: 0|1, value_bit: 0|1, ...optional *_bit fields }
}

binary_delta: {
  set: { <VARIABLE_ID>: <bit-cell> },
  clear: [<VARIABLE_ID>]
}
```

Unknown remains masked (`known_bit=0`) and MUST NOT be coerced to false.

A replay engine may reconstruct state by applying ordered deltas from a trusted checkpoint/genesis.

## Stream classes

The same event ABI may be projected into distinct owner streams:

```text
agent_history
assignment_history
task_history
work_history
conversation_history
requirement_history
lesson_history
release_history
provider_attempt_history
meter_history
```

One physical event may be indexed into multiple projections by ref. It MUST NOT be duplicated as different canonical events merely because multiple consumers need it.

## CRM join

CRM is a projection over actors, endpoints, work, tasks, conversations, occurrences, evidence and history.

Minimum CRM event joins where available:

```text
actor_ref
principal_ref
assignment_ref
work_ref
task_ref
conversation_ref
message_ref
occurrence_ref
source_refs[]
```

Hard:

```text
CRM != AUTHORITY
CRM_EVENT != PROVIDER_EVENT_UNLESS_BOUND
CONVERSATION_LOG != WORK_ADMISSION
MESSAGE != TASK
TASK != ASSIGNMENT
ASSIGNMENT != ATTEMPT
```

## Agent IDE and task-history projection

An Agent IDE can project the chain into a chronological workspace:

```text
WHO    = actor/principal/assignment
WHAT   = task/work/event type
WHEN   = observed_at + sequence
WHERE  = project/conversation/provider refs
WHY    = source/requirement/lesson refs
STATE  = binary snapshot/delta
PROOF  = source/receipt refs
NEXT   = derived wake/return target from owning workflow
```

The IDE view is a projection; it cannot mutate history or grant authority without the owning effect gate.

## Conversation-log projection

Conversation history may be represented as ordered occurrence events without storing private bodies in public-safe artifacts.

Safe event metadata may include opaque conversation/message/occurrence refs, hashes/digests, timestamps, actor refs, classification bits and evidence refs.

Private conversation bodies remain in the provider/Bins/CRM custody owner and are dereferenced only under the applicable privacy/access gate.

## Observer ABI (X42/X43-class)

Observers consume a frozen denominator and compare expected vs observed binary states.

For every observed cell:

```text
variable_id
expected_known_bit
expected_value_bit
observed_known_bit
observed_value_bit
source_ref
generation
reason_code
```

Observer output is a delta set:

```text
MATCH
MISMATCH
UNKNOWN_OBSERVED
UNKNOWN_EXPECTED
STALE_GENERATION
MISSING_DENOMINATOR_CELL
EXTRA_UNDECLARED_CELL
```

Hard:

```text
OBSERVER != MUTATOR
REVIEWER_OPINION != BIT_DELTA
SAME_WORKER_SESSION != INDEPENDENT_OBSERVER
MISMATCH != AUTOMATIC_PATCH
```

A mismatch wakes the owning canary/miner/foreman path.

## Metering projection

Metering consumes verified event classes; it does not invent events from prose.

Binary event dimensions may derive counts for:

```text
qualified_execution_attempt
provider_attempt
leased_api_operation
plugin_projection_operation
cadence_tick
backbeat_check
forward_check
return_event
apply_return_event
verified_closure
owner_restatement
manual_relay
manual_archaeology
duplicate_work
flatplane
silent_remainder
prevented_provider_attempt
local_execution_substitution
reused_primitive
reused_receipt
replayed_event_without_rework
```

Money remains downstream:

```text
EVENT_BITS -> VERIFIED_UNITS -> ACTIVE_RATE_CARD -> BILLING_PROJECTION
```

Hard:

```text
QUALITY_UNIT != MONEY
RAW_EVENT != BILLABLE_UNIT
SIMULATION != PROVIDER_ATTEMPT
DUPLICATE_RETRY != PRODUCTIVE_UNIT
BILLING_REQUIRES_RATE_MAPPING
```

## Team measurement

A team/lane scorecard should be computed from event bits and denominators rather than self-reported prose.

Examples:

```text
requirements_preserved / requirements_required
hot_patches_applied / hot_patches_returned
verified_closures / admitted_work
owner_restatements
manual_relays
silent_remainders
reused_primitives
reused_receipts
prevented_provider_attempts
regressions_detected_before_release
regressions_escaped_release
```

Rates/ratios MUST retain denominator identity and generation.

## Rosetta / semantic engine role

The Rosetta-style engine resolves semantic tags and human vocabulary into stable typed refs and binary variables/invariants.

It does not own domain truth merely because it can translate names.

```text
HUMAN_TERM
-> SEMANTIC_TAG
-> TYPED_REF
-> BINARY VARIABLE / INVARIANT
-> SERIALIZED EVENT
-> OWNER-SPECIFIC PROJECTION
```

This makes the event spine usable across legal workflows, publishing, articles, books, software, CRM, support, security and operations without copying domain vocabulary into the SDK base.

## Replay and checkpoints

A replay engine MUST:

1. validate chain order/hash continuity for the selected stream;
2. validate schema and binary cell shape;
3. preserve UNKNOWN masking;
4. apply events in sequence order;
5. stop/fail closed on chain break, duplicate sequence, conflicting event hash or unknown required schema;
6. output reconstructed state plus exact last event hash/generation.

A checkpoint is an optimization only. It MUST name the exact last included event hash and generation.

## Privacy and minimization

Do not place secrets, credentials, unrestricted private message bodies, medical/legal source payloads, or provider tokens into public event envelopes.

Use opaque refs/digests and dereference through the owning protected system.

## Relationship to ROTFL contracts

This ABI composes with:

- `rotfl-binary-variable-invariant-abi.md`
- `rotfl-department-head-manifest-skill-abi.md`
- HOT_PATCH / APPLY-HOLD-REJECT
- RETURN / APPLY_RETURN
- KnowledgeReturn / lesson promotion
- metering/rate-card projections

It owns ordered semantic event representation only. It does not own Work identity, CRM authority, Bins custody, Switchboard effects, Ward policy, Publisher semantics, Desktop UX, or billing rates.
