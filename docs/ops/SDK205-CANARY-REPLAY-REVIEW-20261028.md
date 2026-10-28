# Independent SDK #205 canary replay review, 2026-10-28

**Owner**: SDK PR #205, not a new worker runtime. This is an additive review patch stacked on the existing SDK candidate `14a7859d1d05cd9e9b6b33a07f1ce7397d786761`, preserving SDK's account observation, installed-generation matching, Ward admission and BINS byte verification. No host/plugin/network/credential operation.

## Exact gap

In the source baseline, `canary(binding,scope)` entered `protectedOperation()` and invoked `trusted.executeCanary()` without first checking the existing `ports.readAttempt()` ledger. A caller retry after a result was preserved but its ACK was lost could dispatch the canary again. The separate `recover()` path already correctly reconciled `RESULT_PRESERVED` by independently reopening BINS bytes, so this was a shared SDK lifecycle inconsistency.

## Narrow repair

- Query the already required `ports.readAttempt` before Ward canary submission, bound to the same worker, device, Work, operation and request digest. No new store, port family or provider adapter.
- Unknown, in-flight, preserved, completed or otherwise nonempty attempts return `WORKER_CANARY_RECONCILE_FIRST_DO_NOT_RETRY`, with **no Ward or executor call**. A mismatched Work/device/digest refuses as `WORKER_CANARY_ATTEMPT_UNVERIFIED`.
- The `NO_ATTEMPT` path passes the exact `request.request_digest` as `idempotency_key` to the **existing** Ward-owned `trusted.executeCanary`. Ward/Switchboard must still enforce an atomic claim under their current authority, not merely trust the SDK's preflight observation.
- Reuse `recover()` for an already preserved result; no synthetic new completion or APPLY_RETURN.
- Five new hostile regression cases and one existing positive-canary assertion check the stable key, replay refusal and zero executor effects. The existing SDK owner suite is 25 cases on the candidate baseline; after this patch source denominator is 30. **No local or hosted PASS claimed in this reviewer pass** until the exact candidate runs under the SDK owner's test runner.

## Limits and affected ownership

This prevents obvious sequential redispatch from the SDK call path. It **does not** guarantee exactly-once across simultaneous callers, because the existing trusted `executeCanary` owner must atomically claim `idempotency_key`. A provider reporting `NO_ATTEMPT` without independently bound authority is not itself a grant. Real liveness, session, Ward, BINS and first-party Original Work RETURN are still separate physical qualifications.

The reviewed overlay does **not** duplicate the #204 durable attempt engine; that component and the Ibal #204 consumer still require owner reconciliation. Plugin #50 already imports the SDK worker contract and should adopt this corrected generation instead of copying a worker.

**Backbeat**: the remaining red is atomic Ward/Switchboard canary attempt-claim and production provider/account/host binding, plus ChatGPT tunnel/plugin authorization. **Forward**: SDK owner reviews this bounded patch, merges it into #205 if accepted, reruns the 30-case suite, aligns SDK #204/205, and hands its exact installed generation to Plugins #50 and Ibal #204. Tunnel activation remains separately owned by framework PR #1392; no SSH/HEX reinstall or Desktop Commander.
