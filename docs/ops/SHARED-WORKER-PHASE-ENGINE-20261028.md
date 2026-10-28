# Shared worker phase engine candidate

Existing owner: SDK #9. Base b092f92eb6bfa50825a9e392118bd31ee0b10a05.

## Shared implementation
The existing Ibal durable attempt-phase engine is extracted into the existing SDK worker/lifecycle export as runWorkerLifecycleAttempt. It preserves claim, execution reconciliation, result, return, apply-return reconciliation, and consumer acknowledgement. Ibal retains transport, storage, job/worker/capacity leases, qualified host, and effect admission. No replacement scheduler, credential store, executor or authority service is introduced.

The public SDK boundary additionally rejects inconsistent cached histories: missing/out-of-order phases, wrong work/attempt/source binding, mismatched result digests and broken receipt links. This is consistency validation of owner-supplied durable history, not authentication of arbitrary JSON.

Worker adapter conformance now distinguishes supplied/structural coverage from runtime/release proof, matching the accepted SDK ACK correction. Serialized verified flags and historical EXECUTION_STARTED records cannot qualify release or current process liveness.

## Qualification
- All 273 accepted baseline blobs were compared to the pinned provider tree before editing.
- Full baseline and final candidate npm run check: 96/96 runtime checks plus all supplemental suites passed in isolated HOME/XDG/cache with local test Git metadata. Initial unconfigured-environment failures are not counted as product failures or passes.
- Existing Ibal source consumer baseline: 42/42 scoped checks.
- SDK-backed Ibal candidate: 43/43 scoped checks, including real disposable child execution, persisted same-attempt owner return, consumer readback and cold restart without redispatch. Independently replayed by a separate reviewer.
- Independent reviewer ran 17 extra partial-restart/cached-binding checks. Root separately reran the SDK lifecycle validator and public export probe.
- Full Ibal repository check remains unrun. The consumer test uses an exact-hashed local SDK package link, not an installed product or published package.

## Remaining delivery and runtime boundaries
This candidate does not establish an authenticated provider/account/capability-to-worker join, current worker process liveness, cloud-provider access, ChatGPT attachment or native installed acceptance. The existing Ibal owner must adopt an exact published SDK commit/package with dependency and lockfile qualification. The local consumer patch is not silently treated as main. All live account, Ward/Switchboard admission and installed-generation gates remain separate.

No host installation, provider credentials, account changes, deployment, merge, or release was performed during these tests.
