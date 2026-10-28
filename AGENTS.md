# xi-io SDK managed agent entry

This repository owns the public reusable SDK substrate. It does not own Studio user intent, framework governance, Ward policy, Switchboard effect admission, or product-domain truth.

## October 28 shared onboarding consumption gate (SDK client)

Every SDK adopter that initiates or resumes an XI-IO connection must consume
the **framework-owned**, versioned `xiio.owner.connection-onboarding/v1`
contract and its current authoritative API result; see framework
`docs/ops/CHATGPT-PRIVATE-MCP-TUNNEL-20261028.md`, section
"cross-client acceptance". Do not implement a separate SDK onboarding state
machine, login or tunnel provisioner in this repository.

Current `src/identity/account-binding.mjs` and
`src/identity/launch-session.mjs` are provider/account and launch-ticket
projections with `authority_granted:false`. They cannot turn a saved choice
into a sovereign UserPrincipal, current consent, Ward grant or delegated
Platform permission. `src/worker/connection.mjs` and its existing owner
PR #205 must consume the authorized API response at the real client entry,
not only import a helper or pass synthetic tests.

**Order:** allow local-first install; verify current XI-IO sign-in; present
saved (possibly multiple) ChatGPT/@ibal choices, or ask on first use; require
only missing/changed consent; discover/reuse existing approved services;
provision via the owner API/Ward; verify independently and return to original
requester. Cross-principal saved choices, revoked/expired authorization,
changed scope, unknown outcome and incomplete resume must fail closed with
typed continuation, without prompting for tunnel IDs/keys. Saved intent is
not permission.

Owner acceptance requires **executed SDK consumption** of framework cells
C01–C14, with actual API generation, principal/workspace, installed HEX and
physical Work/BINS return refs. No SDK-only report, mock or green unit test
can claim a live ChatGPT/XI-IO connection. Until then:
`CROSS_CLIENT_CONSUMPTION_UNVERIFIED`.

## Managed cold start

When work is entered from the xi-io managed suite, start from Studio current before selecting SDK work:

1. resolve `Vado42-chris/xi-io-studio:AGENTS.md`;
2. read `installer/app/products/studio-primitives/STUDIO-CURRENT-HANDOFF.current.json`;
3. read `installer/app/products/studio-primitives/STUDIO-CURRENT-SESSION-INGRESS.current.json`;
4. resolve this repository's provider-current `main`;
5. read this file and the affected SDK contract/runtime;
6. run `npm run check`, which is the SDK runtime ROTFL suite.

Hard:

```text
STUDIO_BASE_FIRST
CHAT_OR_COMMENT != SDK_CURRENT
SDK_MAIN != LIVE_PROVIDER_EFFECT
MODEL_LABEL != WORKER_RANK
ACK_TEMPLATE_REF != ACK_TEMPLATE_EXECUTED
STATIC_GREEN != RUNTIME_ROTFL_GREEN
RESULT != RETURN != APPLY_RETURN
```

## ACK ROTFL template invariant

Distributed ACKs and ACK Item Trinity share one ROTFL context.

```text
ACK source
-> reusable_template_refs
-> template_runs
-> ACK item template_route
-> PunchCard + ScoreCard + Checklist same route identity
-> runtime ROTFL receipt + readback
-> RESULT
-> RETURN
-> APPLY_RETURN
-> REAP
```

Current public runtime owners:

- `src/acks/distributed.mjs`
- `src/acks/item-trinity.mjs`
- `src/acks/rotfl-template.mjs`
- `scripts/validate-rotfl-ack.mjs`
- `scripts/validate-ack-rotfl-template.mjs`
- `scripts/validate-ack-item-trinity.mjs`

A terminal ACK state, `RESULT`, `RETURN`, or `APPLY_RETURN`, is invalid when its reusable template denominator has not completed the ROTFL runtime route.

### Structural claims are not runtime proof (2026-10-28 SDK kernel correction)

The public SDK accepts submitted template refs, receipt refs, readback refs and
binary bits as **untrusted structural input**. None of those strings authenticates
execution, even when `state=EXECUTED` and all claimed bits are one.

- `supplied_complete` and `template_supplied_pass` count claimed template coverage.
- `runtime_complete` and `template_pass` remain false/zero in the
  structural-only SDK path until a separately authenticated and generation-bound
  runtime verifier is integrated. Payload-provided `authenticated`, `verified`
  or `runtime_complete` flags are never authority.
- `route_id` identifies the template plan, while `submission_digest`
  distinguishes different supplied receipts/readbacks for that plan.
- Item Trinity preserves the useful `SUPPLIED_UNVERIFIED` UX state and never
  grants closure credit. Distributed ACK `RESULT`, `RETURN`, and
  `APPLY_RETURN` fail closed without authenticated runtime proof.
- This SDK change **does not** claim provider-effect verification. The connection
  builder owns authenticated execution and physical readback; an authorized
  adopter must wire and qualify that evidence before verified terminal ACKs work.

Hard: `SUBMITTED_RECEIPT_REF != AUTHENTICATED_RUNTIME_READBACK` and
`SDK_STRUCTURAL_OK != QUALIFIED_OPERATIONAL_COMPLETION`.

## Worker lifecycle evidence boundary

`src/worker/lifecycle.mjs:compileWorkerAdapterConformance` compiles supplied
contract coverage, not authenticated provider execution. Existing `cells`, `pass`,
`fail`, and `first_red` remain structural diagnostics. `supplied_complete` and
`structural_eligible` make that scope explicit; `runtime_complete` and
`release_eligible` remain false. Payload `verified`, `authenticated`, process IDs,
worker/model labels and historical `STARTED` events cannot change that boundary.
`runtime_first_red` names the missing authenticated generation-bound proof.

The existing owner join must be supplied by the connection/Work runtime, not a
new SDK observer, credential store or authority:

- Plugins' unmerged PR45 work-api-handshake donor contract binds `root_ref`, `work_ref`, `work_generation`,
  `consumer_id`, `canonical_provider_id`, `connection_instance_ref`, `account_ref`,
  `capability_ref`, `host_surface_generation` and `adapter_generation`.
- Ibal's hotfolder worker binding preserves `project_id`, `work_id`,
  `assignment_ref`, `attempt_id`, `agent_id`, `source_generation`, `return_ref`
  and `operation_ref`. These must join the same current provider/Work tuple;
  matching labels or independently supplied references do not establish that join.
- Current process-instance/attempt liveness must be observed by the execution
  owner; historical start records are not liveness. Durable RESULT, RETURN,
  APPLY_RETURN and consumer readback must refer to the same attempt and target.
- Recovery must re-read those owners; it must not blindly repeat an uncertain
  effect or promote a cached receipt to current authentication.

`runWorkerLifecycleAttempt` shares the existing Ibal durable phase engine. Its
adopter must retain the same job/worker/capacity leases across the entire call,
private insert-only history, current-owner checks and qualified effect owners.
The SDK owns phase ordering and same-binding result/return validation only;
it does not own transport, process creation, account admission or credentials.
Restarted EXECUTION_STARTED/APPLY_RETURN_STARTED requires owner reconciliation,
never blind effect replay. The Ibal consumer adoption is separately qualified.

The authenticated production join remains unimplemented in this SDK path.
A disposable Ibal process/return canary is test evidence only, never provider
account, native-installation, Ward admission or Switchboard effect proof.
`time_money_bound_bit` retains its metering meaning, not a timeout or lease.

## Runtime test economy

`npm run check` routes the complete SDK validation denominator through `scripts/run-runtime-rotfl-sdk-check.mjs`.

Every test occurrence records binary execution/readback state, a five-plane MICRO/MESO/MACRO/MEGA/META heat-map cell, measured wall time, `TALK_ACTION_ZERO`, and synthetic simulation cost. The runner collects the complete heat map before reduction.

```text
TALK_ACTION=0
TIME=$
BREAK_FIRST -> HEATMAP -> ROOT_REDUCE -> SHARED_REPAIR -> AFFECTED_REPLAY
```

Simulation cost is synthetic and has zero real provider effect. Real billing, payment, send, deploy, publish, or other consequential effects require their separate current consent/admission chain.

Hard:

```text
SIMULATED_BILLING != REAL_PROVIDER_CHARGE
NO_USER_CONSENT != SKIP_BILLING_SIM
LOCAL_PATH_FIX != ROOT_REPAIR
TRUNCATION != EVIDENCE_DELETION
PASS != LIVE
```

## Conversation, MCP, and A2A continuity

Conversation history, reusable tool/template discoveries, MCP/A2A capability observations, and owner corrections are inputs to the provider-neutral Studio/framework continuity chain. They must not survive only in comments.

```text
conversation occurrence
-> Studio current ingress
-> SourceOccurrence / QueryEvent
-> KnowledgeReturn / CRM readback
-> capability projection
-> ACK ROTFL template route
-> affected RETURN/APPLY_RETURN/REAP
```

MCP/A2A capability visibility never grants effect authority. Runtime execution and readback remain separately qualified.

## Shared worker connection: one owner for every agent (2026-10-28)

Provider/account selection, installed-worker startup, liveness, canary execution, BINS-verified bytes and recovery share ONE SDK implementation. Before any agent starts another adapter, resolve `@xi-io/sdk/worker/connection` / `src/worker/connection.mjs` through the existing `@xi-io/sdk/worker/lifecycle` boundary. Reuse the existing SDK account-binding functions; adapters own only provider-specific transport and data mapping. A missing installed SDK is typed WAIT, never a shadow implementation. Existing Ward and Switchboard remain the only effect authorities.

Runtime proof is not a source unit test. The shared worker conformance retains 14 required bindings, three qualification domains (`recovery_wake`, `admission`, `affected_return`) and independent executor/hostile/reviewer principals; no single agent self-ACKs that quorum. Source candidate [SDK #205](https://github.com/Vado42-chris/xi-io-sdk/pull/205) and plugin consumer [Plugins #50](https://github.com/Vado42-chris/xi-io-plugins/pull/50) are NOT yet installed or authority-qualified. Refuse account fabrications, new grants, duplicate enrollment, fake liveness, unverified BINS bytes, blind retries and provider fallback.

Hard: `ONE_SHARED_SDK_WORKER_LIFECYCLE | PROVIDER_ADAPTER!=WORKER_OWNER | STATUS!=LIVENESS | SHA!=EXECUTION | RESULT!=RETURN!=APPLY_RETURN | THREE_ROLE_REVIEW_REQUIRED`.

## Live connection recovery catch-up (SDK notebook and paused agents)

NotebookLM, a resurrected SDK notebook agent, or any agent absent from the
October 27–28 XI-IO connectivity repair must **not** reuse its old connection
status as current. After the Studio CURRENT front door above, resolve the
framework owner's provider-current
`docs/ops/CHATGPT-PRIVATE-MCP-TUNNEL-20261028.md`
and framework [#1366](https://github.com/Vado42-chris/xi-io.net/issues/1366)
as observed connection receipts and pending gates. Refresh the referenced
GitHub commits **and** physical installed-generation evidence; neither a
GitHub comment nor this SDK paragraph is the canonical runtime authority.

Owner's most recent externally returned Loki receipt:
`MCP_STDIO_INSTALLED_PROTOCOL_VERIFIED` for
`private-mcp-stdio-f743a92fe4fb`. Previous Loki HEX MCP host source
was physically read back; the broad HEX auto-install run `40670506512`
was cancelled; the current framework main workflow validates source on
hosted runners, and broad install is manual dispatch only. These are
not proof of a running Secure MCP Tunnel, ChatGPT plugin attachment,
first-party device-session issuance, Ward admission, network/share
discovery, protected host execution, or BINS/Work RETURN.

Preserve the existing Loki server, Aries client, identities, tunnels,
records and installed HEX generation. Never re-run the HEX installer,
create duplicate enrollment/authority, silently expose private host data,
or substitute Desktop Commander. A paused agent must classify old
statements `HISTORICAL_REVIEW_NOT_CURRENT`, and refresh from the current
owner and physical returns before contributing a proposed correction.
If no connector is available to send the correction to a private notebook,
record `NOTEBOOK_DIRECT_DELIVERY_UNVERIFIED` rather than claiming
the notebook was updated. One mutation custodian, affected source
readback, explicit Ward consent and physical runtime proof still apply.

## Mutation boundary

Use the smallest shared-owner patch that fixes the root contract. During hostile explosion, do not repair each failing path independently. Preserve all reds, reduce them to shared root causes, patch the semantic owner once, replay the affected denominator, then return/reap.

No external send, purchase, deployment, destructive action, or other consequential provider effect is authorized by this file.
