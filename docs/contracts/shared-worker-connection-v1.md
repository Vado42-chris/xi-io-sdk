# XI-IO shared worker connection, executable SDK kernel

**Owner:** xi-io SDK `src/worker/lifecycle.mjs` / `src/worker/connection.mjs`  
**Human alias:** One connection worker reused by every plugin  
**Role:** reusable lifecycle coordinator, not account authority, broker, driver, installer or provider-specific plugin

## Why here

The existing SDK exports `@xi-io/sdk/worker/lifecycle`, `@xi-io/sdk/providers`, and `@xi-io/sdk`'s account-binding source. Zed/Inbox plugins had begun maintaining separate localhost status, provider selection and model-response checks. This repair introduces **one SDK-owned executable coordinator**, available both from `@xi-io/sdk/worker/lifecycle` and `@xi-io/sdk/worker/connection`. Adapters supply IO ports, never copy the state machine or fabricate account identity.

## Binary contract / stages

1. **BIND**: `ports.readAccount` must supply a provider-observed canonical account; call existing `observeAccount` and explicit `chooseAccount`, then `bindOwner`. The actual installed worker's `readInstalledWorker` must match canonical owner, device, source generation, installed generation, installation SHA256 and binding reference. Output `BINDING_OBSERVED` is **not** Ward authority.
2. **LIVENESS**: `ports.observeWorker` must report actual installed process, current generation, running service and an observation <=30 seconds old. Output `LIVENESS_OBSERVED`, not independently certified proof from a status Boolean.
3. **STARTUP**: read the existing owner attempt **before effects**. `UNKNOWN/IN_FLIGHT` refuse with `WORKER_START_UNCERTAIN_DO_NOT_RETRY`; `STARTED_VERIFIED` only reobserves, no restart. `NO_ATTEMPT` requires `ports.withCurrentAuthority` and exact, expiring `trusted.admit` from Ward before `trusted.startWorker`, then current liveness.
4. **CANARY**: a fixed original `XIIO_SDK_WORKER_CANARY_V1\n` is permitted only with current Ward admission and live worker. `trusted.executeCanary` returns a result **reference**, never successful bytes. `trusted.readPreservedVersion` must independently reopen exact BINS `resource_ref + version_ref` and return raw bytes; SDK compares size, SHA256, exact original content, Work/worker/request digest, and requester scope. Max 16 KiB. `CANARY_RETURN_VERIFIED` is **not** original Work APPLY_RETURN.
5. **RECOVER**: `ports.readAttempt` obtains the authoritative pending attempt. An unknown attempt **never** executes again. A preserved result is reopened through BINS under a new read admission; a definitely stopped worker may restart only under separately admitted Ward recovery, followed by independent liveness. No blind retries, new enrollment or replacement jobs.

## Runtime authority

The SDK **does not implement** `withCurrentAuthority`, credential issuance, leases or a database, and never translates model-provided flags into admission. The installed Ward authority owner must supply the atomic transaction/currentness semantics, including principal, device, assignment, WorkerTarget, Work, lease, approval, expiry, revocation and request digest. The consumer must verify that the injected ports refer to the actual installed owners. No scoped port => fail closed.

The SDK's structural `compileWorkerAdapterConformance` remains a separate **14-cell** assurance projection. Independent review remains its existing executor / hostile / reviewer trio across recovery, admission and affected return. Source-only conformance does not grant effect authority.

## Plugin consumption

- Installed SDK export: `@xi-io/sdk/worker/connection` (also re-exported through `@xi-io/sdk/worker/lifecycle`).
- For preview-only Zed/Inbox consumers: `inspectLocalAgentStatus`, `normalizeLocalAgentMessage`, `validateLocalAgentTurnReply`. Those functions preserve the explicit `PREVIEW` ceiling and do not assert independent installation merely because the local server claimed it.
- For a qualified worker owner: `createSharedWorkerConnection({ports,clock})` provides `bind`, `observeLiveness`, `start`, `canary`, `recover`. Plugins provide the port adapters and cannot override the SDK lifecycle order.

## Acceptance truth

`node --test scripts/test-worker-connection.mjs` covers **25 disposable synthetic cases** including wrong chosen account, expired liveness, incorrect Ward admission, duplicate start, lost ACK, real byte reopening, tampered results, interrupted-return reconciliation, and typed recovery. These tests contain isolated mock ports. They **do not establish a physical Loki or Aries worker, verified third-party provider authentication, a running tunnel, ChatGPT MCP attachment or a production Ward/BINS service binding**. Those require separate exact installed-consumer and three-role currentness receipts. Do not mark physical execution or Work APPLY_RETURN complete from the SDK test.
