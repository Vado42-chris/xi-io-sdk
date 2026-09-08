# xi-io SDK

Public component and primitive source for xi-io.

This repository owns the public reusable component implementations, primitive contracts, callable UUID anchors, and playground surface.

The proprietary xi-io management machinery is not mirrored here. Currentness, qualification, promotion, adoption, retirement, security policy, orchestration, evidence, and effect admission remain behind the protected framework/Ward boundary.

A callable UUID is a public discovery and invocation anchor only. It is not canonical identity, truth, authority, qualification, provenance, or provider-effect evidence. Catalog entries are the SSOT for these anchors; `callable_namespace_uuid` is documentation-only on this tip and does not mint matching handles.

HTML composition slots such as `bodyHtml` / `iconHtml` are caller-trusted input, not a sanitizer.

## Provider operation state

`@xi-io/sdk/providers` exposes `normalizeProviderFailure(...)`, a provider-neutral public projection for external AI/provider failures. It turns provider evidence such as HTTP status, provider status/reason, optional retry/reset hints, and optional trace IDs into a bounded `xiio.sdk.provider-operation-state/v1` result.

It deliberately does **not** own retry scheduling, fallback authority, credentials, provider qualification, work invalidation, or source failure. For example, `HTTP 429 + RESOURCE_EXHAUSTED` becomes `PROVIDER_CAPACITY_EXHAUSTED / WAIT_PROVIDER_CAPACITY`; authentication remains `UNKNOWN` unless separately evidenced, and missing retry timing remains `UNKNOWN`.

```js
import { normalizeProviderFailure } from '@xi-io/sdk/providers';

const state = normalizeProviderFailure({
  provider: 'Example Provider',
  operation: 'agent_execution',
  http_status: 429,
  provider_status: 'RESOURCE_EXHAUSTED',
});
```

The SDK is the car. The protected framework is the gas and management system.

## Agent CLI

The package installs `xi`, with `xi-io` as an alias for the same binary. Its SDK command family is a local JSON adapter over nine existing public
exports. Ibal or any external agent can use the same command and payload, with
no provider-specific prompt or transport. Discover exact commands with:

```sh
xi sdk commands
```

The existing command lexicon owns `sdk.commands` and `sdk.call`. Their public callable discovery contains the package version, public specifier,
export name, and positional JSON argument count. It is derived from the actual
public modules. Domain aliases such as `#worker` remain unbound until a
qualified semantic mapping exists, and are rejected as execution commands.

```sh
xi sdk call normalizeProviderFailure <<'JSON'
{"args":[{"provider":"External provider","http_status":429,"provider_status":"RESOURCE_EXHAUSTED"}]}
JSON
```

Input is JSON on stdin, limited to 1 MiB, 32 levels and 20,000 values. Output is
one JSON result. Exit 0 means the calculation completed, including a computed
WAIT or BLOCKED result. It does not mean an operation was admitted or executed.
Invalid input or an unknown command exits 2 with a generic rejection that does
not echo the input. Only public-safe projections belong in these inputs;
credential fields and authorization headers are rejected. The public callable adapter does not
discover repositories, import caller-selected code, contact providers, schedule
workers, store results, or grant effects. Its output can be ingressed by the
existing protected orchestration and custody owners.

## Provider roster binding

`compileIbalCanary` accepts `xiio.sdk.ibal-canary/v2`, which requires a supplied
`provider_registry` containing `ref`, `generation`, and a nonempty set of
`required_provider_ids`. Provider IDs are stable opaque identifiers, not a
hardcoded vendor roster. The existing synthetic canary illustrates the shape.
Adding or replacing a registered provider requires new input, not an SDK edit.

Missing required lesson rows remain visible as `PROVIDER_LESSON_MISSING` with
the complete supplied denominator. Duplicate or undeclared provider IDs are
rejected. The projection records `SUPPLIED_UNVERIFIED` and
`authenticated_registry_proof: false`; a JSON ref is not authenticated registry
readback. `READY_FOR_SWITCHBOARD_PREFLIGHT` remains a calculation for preflight,
with zero effect authority.

Migration: v1 inputs remain readable. Without a supplied registry they return
`WAIT / PROVIDER_REGISTRY_UNBOUND` and a null denominator. They cannot silently
inherit the former six-provider assumption. Both input versions return the
explicit `xiio.sdk.ibal-canary-projection/v2` coverage shape. This change affects
the existing candidate package and is not a public release or adoption claim.

## Reusable learning loop

The existing canary's `lesson_fractal.learning` carries evidence bindings for
observation, shared primitive, Bins persistence, independent peer replay,
affected return, and the next cadence wake. The generated projection gives all
six stages a separate state and retains missing stages as `UNKNOWN`. This lets
Ibal calculate where a reusable lesson stops without treating a saved local fix
as completed learning.

The supplied learning object names a `generation`, `author_worker_ref`,
`observation_ref`, `shared_primitive_ref`, and four receipt objects:
`bins_receipt`, `peer_replay`, `affected_return`, and `cadence_wake`. Each receipt
has `ref` and the same lesson `generation`. The peer adds `worker_ref`, which
must differ from the author. The return adds `target_ref`, matching the existing
`return_target_ref`; the wake adds `next_action_ref`, matching the existing exit
loop. The canary fixture provides a complete synthetic example.

Missing evidence produces `WAIT_EVIDENCE` and named blockers. Complete supplied
bindings produce `WAIT_VERIFICATION`, with `verified_stages: 0` and
`closed: false`. Caller `PASS`, `verified`, or closure fields are not projected.
Distinct worker refs and matching generations are structural checks, not proof
of independent execution. Authenticated Bins readback, peer execution, affected
consumption, and cadence admission remain with their existing protected owners.
Earlier v1 or v2 inputs without learning bindings remain readable but report all
six stages missing. Reaching preflight readiness never closes the learning loop.

The implementation lives in the existing `@xi-io/sdk/lessons` module and is
shared by `compileIbalCanary` and `xi lesson promote`. Lesson promotion uses the
same `learning` object, with `generalized.skill_refs`, `return.target_ref`, and
`cadence.next_action_ref` supplying its existing context. Owner relay remains an
explicit blocker. Declared proof tiers are retained as `declared_proof_tier`;
the calculated proof tier is `UNVERIFIED`. `assertLessonNotFlatplaned` rejects
closure because this public module has no authenticated evidence verifier.

## Baseline and return evidence

Baseline cells retain their supplied classification as `declared_state`.
Declared PASS or N/A becomes `SUPPLIED_UNVERIFIED`, rather than verified closure.
`supplied_coverage_complete` reports coverage separately from `closure_100`.
Missing branch census and malformed head SHAs remain UNKNOWN. Classification
must be present before integration coverage can be complete.

For `xi burnmap compile`, each return must bind the exact repository head and
baseline generation and supply one `cell_receipts` row per baseline cell. A row
contains `cell_id` and `receipt_ref`. Duplicate subjects, unknown subjects,
duplicate cells and incomplete sets cannot silently produce a current return.
A complete set contributes to `supplied_binding_count`, with state
`SUPPLIED_UNVERIFIED`; `current_returns` remains zero until authenticated
verification exists outside this pure projection. Distributed ACK validation
likewise reports `STRUCTURAL_ONLY`, never worker authentication or execution.
