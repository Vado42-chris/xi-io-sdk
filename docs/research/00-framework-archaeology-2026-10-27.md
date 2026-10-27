# 00_framework archaeology — recovery decision

Status: SOURCE-INSPECTED / NO RUNTIME PROMOTION
Date: 2026-10-27

Pinned evidence:
- historical ancestor: Xibalba-Studio/xibalba-framework-repo@0ce4886bfc7a124ad4921f6092f71e4cd3b74d7b
- current framework: Vado42-chris/xi-io.net@97ad530926870adc088924af8e04e8934ed1c3e4
- current SDK: Vado42-chris/xi-io-sdk@d1d145ff25ee1df2ccc36960b8bf93c0d5b1ff00

## Verdict

The supplied thesis contains a real architectural signal but collapses several generations of XI-IO vocabulary.

The September 2025 ancestor genuinely implemented lightweight context reduction and focused multi-agent handoffs. The 2026 framework later formalized PunchCards, reducers, generation/currentness gates, affected-set logic and RESULT/RETURN/APPLY_RETURN. The current SDK/Switchboard adds portable lifecycle admission, hostile qualification, device execution and durable readback.

Recover the invariants. Do not recreate unproved historical mechanisms.

## Verified historical implementation

XIBALBA_CONTEXT_ENGINEERING_SYSTEM.py defines ContextBundle with session_id, agent_type, timestamps, prompt operations, read/write commands, tool calls, context summary, token use and performance metrics. It persists bundles and creates focused context primes.

The documented context lifecycle is:

    REDUCE -> DELEGATE -> PRIME -> BUNDLE

The ancestor also contains specialized agents/fire teams, GitHub issue/worktree integration, proof/validation loops, security/compliance stages and network/process evolution monitoring.

This supports the historical principle:

    bounded context + explicit session identity + focused worker
    + operation history + independent validation
    -> compact working projection

## Claims NOT recovered from the inspected ancestor

Exact repository searches found no supporting implementation for:

- scorecard.json as canonical reduced state;
- PunchCard as the original @ibal SDK payload;
- one historical pure reducer() runtime;
- universal HMAC-SHA256 + nonce evidence chaining;
- hardware traps tied to swb_/xiio_/ib_ prefixes;
- YARS DAG enforcement using parent_id/message_id;
- a patent library.

These remain UNPROVEN HISTORICAL CLAIMS. Absence here does not prove they never existed on another branch/archive; it does prevent claiming they were recovered from this source generation.

The previously reported generated/repo_archaeology/agent_tracking_ledger.json is also absent from both xi-io-sdk/main and xi-io.net/main at inspection time. Treat that write as REPORTED, NOT VERIFIED.

## PunchCard chronology

PunchCard is real in current xi-io.net.

Current source includes:
- engines/punchcard-plan-bridge/compile-punchcard-plan-bridge.mjs
- scripts/punchcard-simulation-runtime.mjs
- scripts/validate-punchcard-simulation-runtime.mjs
- scripts/validate-waterfall-punchcard-lock.mjs
- docs/ops/BURN-MAP-PUNCHCARD-PLAN-BRIDGE-001A.md
- standards/punchcards/impact-blastwave-draft10.v1.json

The compiler preserves card_root_id across intake/delivery and rejects root forks. The burn map explicitly separates SIM from runtime, ACK from ATTEMPT, RESULT from RETURN/APPLY_RETURN, and avoids competing stores/writers.

Supported lineage:

    historical ContextBundle
      -> bounded/session-scoped projection
      -> 2026 PunchCard / Plan / Cadence formalization
      -> current SDK Work/Attempt/Result/Return contracts

Not supported:

    2025 ContextBundle == current PunchCard implementation

## Reducer recovery

The old source shows reduction as context-management philosophy, not a proven single state reducer.

Modern descendants are stronger: transition-proof reducers, cadence/reaper reducers, event reducers, generation/currentness gates and blastwave/affected-set reducers.

Current hard rules include:

    RESULT != RETURN != APPLY_RETURN
    APPLY_RETURN != REAP
    SOURCE != RUNNING != LIVE != USABLE
    ACP_RUNNING_WITHOUT_LEDGER_DELTA != QUALIFIED
    LEDGER_DELTA_WITHOUT_SESSION_ID != QUALIFIED
    ALREADY_PROVEN_FACTOR_REOPENED_WITHOUT_INVALIDATOR != PASS

Do not add a second scorecard state store. Implement reduction as a projection over existing owners:

    occurrence + generation + Work + current source refs
    + resources + relationships + capabilities
    + attempt/result/return + invalidators
    -> bounded WorkerProjection

PROJECTION != AUTHORITY.
PROJECTION != WORK_LEDGER.
PROJECTION != RESOURCE_CUSTODY.

## Cryptographic evidence

No universal historical HMAC chain was recovered.

Retain the useful invariant, not the invented history:

    CLAIMED_DIGEST != EXECUTION_PROOF
    MATCHING_DIGEST != AUTHORITY
    SOURCE_PRESENCE != INSTALLED_RUNTIME
    RESULT_CLAIM != PROVIDER_OR_DEVICE_READBACK

Use content digests for byte identity, signed device/session identity for actor/device identity, and Ward admission for authority. Do not collapse these into one cryptographic abstraction.

## YARS / graph continuity

No historical YARS implementation was recovered. The attributed problem is real but current XI-IO already has stronger primitives: occurrence identity, Work lineage, generations, relationship graphs, direct/reverse affected-set walks, return correlation and currentness invalidation.

Do not create a YARS graph database. If a historical YARS artifact is later found, map it into the existing occurrence/relationship/Work model and preserve provenance.

## Patent/IP claim

No patent-library artifact or patent references were found in the inspected historical repository, current xi-io.net search or current xi-io-sdk search.

State: UNKNOWN.

Do not use patent-recovery claims in engineering or marketing until an actual artifact with custody/generation is recovered.

## Industry comparison

The historical idea was lightweight, but modern frameworks have converged on several similar concerns.

Google Agents CLI/ADK now covers sessions, evaluation, deployment, observability and A2A:
https://google.github.io/agents-cli/guide/getting-started/
https://google.github.io/agents-cli/guide/development/
https://google.github.io/agents-cli/cli/

Microsoft 365 Agents SDK normalizes channel interactions into Activity objects and per-turn TurnContext. Microsoft explicitly positions it as channel/message plumbing rather than the orchestration/model:
https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/agents-sdk-overview
https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/activity-protocol

Apple Foundation Models provides stateful sessions, tool calling, transcript inspection, dynamic profiles and transcript rollback/preservation:
https://developer.apple.com/foundation-models-framework/
https://developer.apple.com/documentation/foundationmodels/expanding-generation-with-tool-calling
https://developer.apple.com/documentation/foundationmodels/inspecting-session-transcripts-and-reporting-model-feedback

A2A distinguishes Messages from durable Task Artifacts and warns that Messages are not reliable delivery for critical information:
https://a2a-protocol.org/latest/specification/

That supports XI-IO's modern MESSAGE != DURABLE_RESULT rule.

## SDK recovery decision

Reuse:
1. ContextBundle principle as bounded WorkerProjection.
2. Existing PunchCard identity rules where applicable.
3. Existing ACK -> ATTEMPT -> RESULT -> RETURN -> APPLY_RETURN -> READBACK lifecycle.
4. Currentness + explicit invalidators.
5. Switchboard/Ward/BINS/device.execute as execution/evidence authority.

Do not build:
- another scheduler;
- another Work ledger;
- another relationship graph;
- another BINS store;
- speculative Rust HMAC verification;
- a second PunchCard schema;
- a second YARS store;
- scorecard.json as a new SSOT without recovered authority.

Minimal candidate SDK primitive:

    reduceWorkerProjection(inputs) -> WorkerProjection

Inputs:
- principal/session ref
- occurrence + generation
- Work ref
- current source refs
- resource/version refs
- relationship/affected refs
- qualified capabilities/tools
- effect ceiling
- attempt/result/return state
- invalidators

Output:
- projection id
- subject/current generation
- bounded objective
- required evidence
- capability refs
- unresolved gates
- next admissible transition
- return target
- evidence refs

Hard:
- STALE_INPUT -> PROJECTION_NOT_CURRENT
- MISSING_REQUIRED_REF -> UNKNOWN/BLOCKED
- REDUCTION_MAY_DROP_REDUNDANT_CONTEXT
- REDUCTION_MUST_NOT_DROP_UNRESOLVED_OBLIGATION

## Archaeology matrix

| Claim | Finding | Class |
|---|---|---|
| context optimization | REDUCE/DELEGATE/PRIME/BUNDLE | VERIFIED HISTORICAL |
| session bundles | ContextBundle.session_id + operation/tool logs | VERIFIED HISTORICAL |
| multi-agent/fire teams | source/docs | VERIFIED HISTORICAL |
| proof/validation loops | source/docs | VERIFIED HISTORICAL |
| original PunchCard SDK | absent in inspected 2025 ancestor; extensive 2026 family | LATER FORMALIZATION |
| scorecard.json SSOT | not found | UNPROVEN |
| historical pure reducer | not found | UNPROVEN; MODERN DESCENDANTS |
| universal HMAC chain | not found | UNPROVEN |
| namespace hardware traps | not found | UNPROVEN |
| YARS parent/message DAG | not found | UNPROVEN |
| RESULT/RETURN/APPLY_RETURN | modern executable contract | VERIFIED MODERN |
| PunchCard root/projection identity | current compiler/validators | VERIFIED MODERN |
| patent library | no evidence found | UNKNOWN |
| archaeology tracking manifest already written | absent from inspected main branches | REPORTED NOT VERIFIED |

## Next archaeology

Only continue archaeology where it can change a current design decision. Search archived/private Xibalba repos/tags, historical @ibal branches, local 00_framework custody, exported onboarding packs, old Drive/Dropbox archives and pre-PunchCard PR branches for:

    scorecard.json
    PunchCard / punch_card
    reducer( / reduce(
    parent_id / message_id
    yar / yars
    HMAC / nonce
    session custody
    append-only
    context bundle

Every recovery must record immutable generation/digest, path, date, executable-vs-documentation class, chronology, current descendant and adoption recommendation.

## Decision

Use the old framework as archaeological input, not restoration authority.

The lightweight idea worth carrying forward is re-reduction from durable current state. The modern correction is equally important:

    projection != authority
    claim != execution
    result != return
    source != installed
    message != durable artifact
    stale evidence != current truth

That combination is simpler than another orchestration framework and safer than rebuilding mechanisms that archaeology has not actually proven.
