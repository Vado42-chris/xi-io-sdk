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

## Mandatory native self-inspection and approval-request cycle, 2026-10-28

The current SDK candidate required an approval_ref before even forming an action request. That made an exact new owner approval request impossible. The patch allows an initial unapproved request, preserves the old approved request_digest, and binds stable intent_digest across an authenticated Ward challenge and later approved re-entry. Only the existing Ward API can return a request-bound, non-expired APPROVAL_REQUIRED challenge. The SDK returns OWNER_APPROVAL_REQUIRED with exact Work/device/operation/intent and zero effects; it does not mint approval, credentials or execute a model instruction.

Before every protected effect, existing worker ports MUST supply inspectInstalledFramework on the actual local installation. The SDK binds on-disk bytes/generation/installation SHA to the exact request and rejects stale or changed bytes; within the same current-authority transaction, the existing Ward owner MUST independently confirm native inspection through verifyDiskInspection before admitting any worker start, canary, recovery or preserved-version read. Missing source/runtime security is a typed blocked_operation with the exact existing owner repair, NOT a permission override. Production callbacks must be backed by actual installed framework/Ward records; fixture mocks cannot qualify them. This is an additional security/operational binding requirement for SDK PR #205, plugin PR #50 and Ibal PR #204, not a new runtime/service or host deployment. Real authorized file access and Aries/Loki installed consumer remain OPEN.

No SSH, tunnel/key, HEX or local disk changed in this review candidate.
## Narrow, approved content-read consumer (2026-10-28)

The shared worker now exposes **readFile** over the SAME `createSharedWorkerConnection` and existing native Ward/BINS ports, not a second filesystem service. The only input target is a previously preserved `BINS ResourceRef + ResourceVersion` plus expected exact SHA-256 and bounded byte length, bound into both approval intent and request digest. No literal disk path, raw embedded content or arbitrary shell request is accepted. The trusted installed-runtime inspection and Ward verification precede authorization. Ward's approved read invokes its existing `readPreservedVersion` function, reopens actual bytes, checks the exact request principal/Work/ref/version/digest and requires a BINS-issued readback reference. The returned base64 content can then be used by an **authorized consuming agent**; it is not a metadata observer. The original Work's APPLY_RETURN remains separately required.

The initial portable SDK size limit is 64KiB *per exact preserved-version read*, not a global BINS transfer cap or a claim of large-file/chunk transport. Reuse SDK #202's qualified exact byte reader and existing BINS #110 preserved-version source in the native owner adapters when accepted; DO NOT duplicate them. The SDK constructor's mandatory native inspection and Ward verification remain fail-closed until actual Aries/Loki runtime ports are installed and independently accepted. No actual machine was accessed by this source change.
