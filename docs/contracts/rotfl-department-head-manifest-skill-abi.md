# ROTFL Department-Head Manifest + Skill ABI

Status: reusable public-safe contract
Scope: white-label SDK base; adopter products specialize without redefining the ABI

## Purpose

A department head is a durable organizational identity, not a task worker. The department head owns a stable mission/manifesto, skill manifest, ACK schema, logical mailbox/return address, authority/effect ceiling, stop lines, learning references, and adopter obligations.

A task is executed by a bounded projection of that durable identity. The projection is disposable and may be instantiated at any hierarchy level with only the skills, tools, metrics, denominator, TTL, and return target required by the work.

```text
SDK primitive
  -> universal ROTFL lesson
  -> department-head manifesto + skill manifest
  -> adopter specialization
  -> bounded projection
  -> ACK (when a real worker exists)
  -> canary
  -> miner HOT_PATCH
  -> foreman APPLY | HOLD | REJECT
  -> revision
  -> draft/review surface
  -> deliverable/release gate
  -> RETURN / APPLY_RETURN
  -> lesson/adopter backfeed
```

## Durable department-head identity

A department-head manifest MUST carry:

```text
DEPARTMENT_ID
PERSONA_ID
MISSION
MANIFESTO_REF
SKILL_MANIFEST_REF
ACK_SCHEMA_REF
LOGICAL_MAILBOX_REF
RETURN_TARGET_REF
AUTHORITY_CEILING
EFFECT_CEILING
STOP_LINES
LEARNING_LEDGER_REF
ADOPTER_REFS
CURRENT_GENERATION
```

The logical mailbox is a routing primitive. It MUST NOT imply a live provider mailbox, worker admission, delivery, or external effect without separate provider-native proof.

## Manifesto vs skill manifest

The **manifesto** owns durable intent:

- what human/system outcome the department protects;
- what it optimizes;
- what it refuses to trade away;
- what classes of failures it owns;
- who its upstream and downstream owners are.

The **skill manifest** owns executable competence:

- skill IDs and versions;
- allowed tools/capability classes;
- required inputs;
- required outputs;
- canaries and negative canaries;
- metrics;
- stop lines;
- effect ceiling;
- fallback/wake semantics;
- HOT_PATCH return ABI.

A manifesto is not executable authority. A skill manifest is not worker admission.

## Projection contract

Every projection MUST bind:

```text
PROJECTION_ID
PERSONA_ID
DEPARTMENT_ID
LEVEL
SCOPE
DENOMINATOR
SOURCE_GENERATION
TARGET_GENERATION
SKILL_REFS
TOOL_REFS
METRICS
TTL
RETURN_TARGET
EFFECT_CEILING
ACK_STATE
```

Hard:

```text
PERSONA != PROJECTION
PROJECTION != LIVE_WORKER
ACK != ATTEMPT
ATTEMPT != RESULT
RESULT != RETURN
RETURN != APPLY_RETURN
```

A department head may project a miner as researcher, clerk, accountant, renderer, adversary, accessibility reviewer, security reviewer, release manager, or another bounded role without minting a new durable persona.

## Canary -> miner rule

A canary that identifies a new defect category or primitive class MUST open or join exactly one miner shaft owning that class denominator.

The canary MUST NOT terminate with findings only.

The miner MUST return either:

1. a tested `HOT_PATCH`, or
2. a typed `HOLD` with the exact missing bridge, wake, and affected consumers.

Equivalent recurrences join the same shaft; they do not mint duplicate lessons, personas, control planes, or work items.

## HOT_PATCH ABI

```text
PATCH_ID
CANARY_ID
PERSONA_ID
PROJECTION_ID
TARGET_GENERATION
AFFECTED_CONSUMERS
SOURCE_REFS
PRECONDITIONS
EXACT_DELTA
TESTS
NEGATIVE_CANARY
ROLLBACK
NO_EFFECT
OWNER_GATE
RETURN_TARGET
WAKE
```

Hard:

```text
HOT_PATCH != REVISION
HOT_PATCH != DRAFT
HOT_PATCH != DELIVERABLE
```

A miner may propose and test a patch. It may not silently promote a final generation.

## Foreman / @IBAL projection

The foreman owns patch fan-in and revision composition.

For each HOT_PATCH it MUST:

1. re-read the target generation;
2. reject stale-target patches;
3. choose APPLY, HOLD, or REJECT;
4. apply changed-only;
5. rerun affected negative canaries;
6. enumerate fan-out consumers;
7. compose the revision from the accepted patch set;
8. record superseded/reaped patch attempts;
9. hand the revision to review/release gates.

## Revision, draft, deliverable

```text
PATCH = smallest tested delta
REVISION = base generation + accepted patch IDs
DRAFT = human/reviewer-facing candidate state
DELIVERABLE = assembled release artifact with exact membership, render/readback, effect state, and release gate
```

A new pass MUST NOT create a new full version merely because time advanced. A new revision requires an accepted patch or other explicit generation-changing input.

## Whole-experience release invariant

The department head MUST treat the system as an experience, not a pile of artifacts.

Before release, enumerate all affected consumers/personas, including where applicable:

- owner/operator under time or cognitive pressure;
- end user/customer;
- clerk/intake/registry;
- signer/commissioner/notary;
- judge/decision maker;
- opposing/receiving party;
- service/delivery channel;
- cold successor/agent;
- security/privacy owner;
- accessibility/UX owner;
- package/runtime/release owner.

For every consumer ask:

```text
What do they need first?
What action do they own?
What must they not do?
What source/proof can they locate?
What state is this object in?
What happens next?
What failure would they reasonably make from this surface?
```

A defect discovered anywhere is class-level until proven isolated.

## Response / obligation denominator

For workflows that respond to incoming obligations, requests, defects, tickets, filings, messages, or events, final assembly MUST begin with an explicit denominator of every live incoming object.

Each object MUST exit exactly one state:

```text
ANSWERED_IN_DELIVERABLE
RESPONDED_SEPARATELY_WITH_PROOF
SUPERSEDED
DEFERRED_WITH_REASON_AND_WAKE
PROCEDURAL_ONLY_NO_RESPONSE_REQUIRED
UNKNOWN_BLOCKS_RELEASE
```

Omission from the checklist MUST NOT silently mean no response is required.

## Accessibility / plain-language companion rule

When official/native artifacts are difficult to use, an accessibility aid may be derived without replacing the authoritative artifact.

```text
AUTHORITATIVE_OBJECT != ACCESSIBILITY_AID
```

The aid may add plain-language labels, 5Ws, action order, checklists, navigation, contact dependency chains, and state cues. It MUST preserve the authoritative object's identity, source role, and legal/operational effect boundary.

## Rendering / artifact economics

Prefer native structured editing and changed-only render QA.

```text
PATCH_NATIVE_ONCE
-> EXPORT_ONCE
-> INSPECT_CHANGED_SURFACES
-> RUN_FULL_DENOMINATOR_SANITY
```

If a format creates structural bloat or navigation loss, compile a purpose-built derivative while preserving the native structured source.

## Learning promotion

A reusable lesson discovered in an adopter MUST travel upward only after the adopter has proven the pattern and separated adopter-specific facts from the white-label invariant.

```text
ADOPTER_FINDING
-> HOT_PATCH / RECEIPT
-> WHITE_LABEL_INVARIANT
-> SDK LESSON
-> DEPARTMENT-HEAD SKILL/MANIFEST UPDATE
-> AFFECTED ADOPTER WAKE
-> RETURN / APPLY_RETURN
```

A saved local fix is not completed learning.

## User × Experience decomposition rule

Department heads use the shared decomposition method in
`docs/contracts/rotfl-user-experience-socratic-binary-decomposition-abi.md`
when a problem, test, canary, requirement, or experience is too large to route safely as one unit.

The ownership split is:

```text
USER
  owns irreducible human choice and reports the lived experience

UX / HUMAN-EXPERIENCE OWNER
  qualifies perception, comprehension, action, recovery, accessibility,
  cognitive load, and whether the intended experience actually works for the User

TEST / OBSERVER
  asks one smallest sufficient question and returns evidence-bound bits

MINER
  repairs one known mismatch or targetable unknown

FOREMAN / IBAL PROJECTION
  conducts the next question/work formation from current graph + denominator

CADENCE
  orders questions, waits, returns, rejoin, and next beat

REAPER
  removes stale, duplicate, superseded, or non-material questions/selectors

DOMAIN OWNER
  retains source/domain truth and authority
```

Tests are therefore reusable discovery surfaces as well as gates: recurring structurally equivalent tests may expose a template or portable primitive candidate, but promotion still requires existing collision, second-context/hostile proof, qualification, and adopter return.

Hard:

```text
USER EXPERIENCE EVIDENCE != UNIVERSAL DOMAIN TRUTH
UX OWNER != DOMAIN AUTHORITY
QUESTION != TASK
TEST != PRIMITIVE AUTOMATICALLY
LEAF PASS != WHOLE EXPERIENCE PASS
SMALLER != BETTER UNLESS ROUTING/PROOF/DECISION QUALITY IMPROVES
```

## Release test

A department-head loop is complete only when:

- the denominator is explicit;
- every canary has either a miner return or a typed HOLD;
- accepted patches are composed into one revision;
- all affected consumers are reconciled;
- response/obligation coverage has no silent omissions;
- duplicate/stale predecessors are reaped from selection;
- required accessibility aids are bound but not confused with authoritative objects;
- render/readback passes for changed surfaces and full-denominator sanity;
- effect state is explicit;
- RETURN/APPLY_RETURN is durable;
- reusable learning has a promotion/backfeed disposition.
