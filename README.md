# xi-io SDK

## Public product surface observations and actions

`@xi-io/sdk/render` preserves the host's environment declaration and labels it
unverified. An optional `host_observation` carries only a public opaque `id`,
`generation`, `sha256:`-prefixed digest, and canonical UTC `observed_at` timestamp
(for example `2026-09-08T13:00:00.000Z`). IDs and generations are bounded to 128
characters and use the existing alphanumeric/dot/underscore/colon/hyphen ID
grammar. The observation renders as `SUPPLIED_UNVERIFIED`; the SDK does not
authenticate it, establish currentness, or grant qualification or authority.
Private evidence, work, provider, credential and endpoint fields remain forbidden.

Rendered actions start disabled. `bindProductSurface(root, { onAction })` enables
only actions the host allowed once a real callback is present. Model-disabled or
host-disabled controls stay disabled; rebinding replaces listeners; cleanup
removes listeners and disables actions. Before calling the host, the binder checks
native field validity and numeric/required constraints, excludes disabled fields,
and reports invalid input in the existing accessible result area. This is generic
UI validation and callback binding, not ACK or effect admission. Domain validation
and runtime authority remain the host's responsibility.

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

## Human terminal operator

The canonical human-facing command is `xi-io`. `xiio` is the no-hyphen human alias, and `xi` remains the terse SDK alias. All three wrappers execute the same SDK runtime.

From any terminal after installation:

```sh
xi-io
```

opens the local Ollama operator in the current directory. A different workspace can be selected directly:

```sh
xi-io ~/path/to/project
xi-io ~/path/to/project --execute
xi-io --model llama3.1:8b ~/path/to/project
```

Preview mode exposes read-only workspace discovery: bounded file listing, literal text search, and text-file reads. `--execute` additionally admits the existing bounded edit and structured command tools. Workspace tools remain constrained to the selected directory and there is no automatic cloud fallback.

Human discovery surfaces are first-class:

```sh
xi-io doctor
xi-io models
xi-io registry
xi-io registry commands
xi-io registry ack
xi-io registry tools
xi-io registry sdk
xi-io registry primitives
```

Inside the interactive shell, use `/help`, `/workspace`, `/tools`, `/commands`, `/ack`, `/model`, `/models`, `/status`, `/clear`, and `/exit`.

To bootstrap the CLI from any authenticated terminal:

```sh
gh api 'repos/Vado42-chris/xi-io-sdk/contents/scripts/install-cli.sh?ref=main' --jq .content | base64 -d | bash
```

The bootstrap keeps a managed SDK checkout under `~/.local/share/xi-io/sdk`, requires a clean `main` branch, fast-forwards only, installs the wrappers, and runs `xi-io self-test`. It refuses dirty or mismatched checkouts instead of overwriting them.

To install the command from an SDK checkout:

```sh
node bin/xi.mjs install
hash -r
xi-io self-test
xi-io doctor
```

The installer writes real wrappers to `~/.local/bin/xi-io` and `~/.local/bin/xi`, plus a managed source pointer under `~/.local/share/xi-io/cli/sdk.path`. The wrapper is cwd-independent. The selected workspace is the human's current directory or explicit directory argument, not the CLI source checkout.

Hard: `HUMAN_ENTRY != SDK_INTERNAL_COMMAND`, `LOCAL_OLLAMA != CLOUD_FALLBACK`, `WORKSPACE_READ != EFFECT_AUTHORITY`, `--execute != MERGE_OR_PROVIDER_AUTHORITY`, `REGISTRY_DISCOVERY != ADMISSION`.

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

## ROTFL User × Experience decomposition

For work described as `UX`, `user experience`, `Socratic`, `binary`, `test decomposition`, `template discovery`, or `primitive discovery`, start with:

- `docs/contracts/rotfl-user-experience-socratic-binary-decomposition-abi.md` — reduces a Human/User × Experience into the smallest sufficient evidence-producing questions while preserving the parent denominator;
- `docs/contracts/rotfl-binary-variable-invariant-abi.md` — masked binary truth cells (`UNKNOWN != false`);
- `docs/contracts/rotfl-department-head-manifest-skill-abi.md` — canary/miner/foreman HOT_PATCH composition;
- `docs/contracts/rotfl-serialized-semantic-event-chain-abi.md` — ordered binary deltas, observers, CRM/history, and metering projection.

The short loop is:

`USER × EXPERIENCE -> smallest sufficient QUESTION -> TEST/OBSERVE -> binary RESULT + evidence -> affected-only HOT_PATCH/WAIT/NO_EFFECT -> RETURN/APPLY_RETURN -> REAP -> changed-only REBASE -> next QUESTION`.

Tests are also reusable-shape discovery inputs. Repeated structural equivalence may produce a test-template or primitive candidate, but never automatic promotion or authority.

Hard: `QUESTION != TASK`, `TEST != TRUTH OWNER`, `LEAF PASS != WHOLE EXPERIENCE PASS`, `UNKNOWN != FALSE`, `REBASE != RESTART`, `TEMPLATE != DOMAIN TRUTH`.

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
