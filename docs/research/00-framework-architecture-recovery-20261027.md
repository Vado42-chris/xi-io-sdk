# 00_framework Architecture Recovery — Evidence Audit and SDK Lineage

**Date:** 2026-10-27  
**Scope:** historical `Vado42-chris/00_framework` → later XI-IO framework/@ibal/PunchCard/Switchboard/SDK lineage.  
**Rule:** historical source, later descendants, current source, documentation, and inference remain separate.

## Executive verdict

The proposed reconstruction contains a real architectural core, but several named mechanisms are anachronistic or unsupported.

The inspected December 2025 `00_framework` supports local JSON/dotfile state, explicit Yin/Yang/Bridge role separation, an append-only Xibalba ledger with chained SHA-256 hashes, continuation/onboarding artifacts for fresh sessions, deterministic validation/checklists, local custody, and recovery.

It does **not** establish an original `@ibal reducer`, universal PunchCards, canonical `scorecard.json` reducer output, HMAC-SHA256 on every machine result, namespace-triggered hardware traps, or a strict YARS `parent_id/message_id` DAG.

Modern XI-IO later evolved the same problem space into explicit @ibal, PunchCards/ScoreCards, Cadence, ACK/YAR, Result→RETURN→APPLY_RETURN, BINS resource/version custody, Ward admission, Switchboard routing, currentness, and hostile qualification.

> **Recover the old semantics. Do not retroactively claim the old repo already implemented the modern ABI.**

## Historical evidence

Repository: `Vado42-chris/00_framework`  
Observed default branch: `phase-seed-whitelabel-search`  
Recursive tree inspected: approximately 55,840 paths.

Key source:
- `aries/core/xibalba/ledger.py`
- `.communication_service/data/messages.json`
- `AGENT_ONBOARDING_INDEX.md`
- `XIBALBA_FOUNDATION_CANON.md`
- `backend/schemas/xibalba-manifest-schema.json`
- `NEXT_SESSION_START.md`
- `PASS_K_CONTINUE.md`

### Xibalba ledger

`aries/core/xibalba/ledger.py` directly implements an append-only truth-preservation mechanism. Entries contain id, timestamp, actor, action, data, `hash_prev`, then `hash_self`. The hash is SHA-256 over sorted JSON. `verify_ledger_integrity()` checks previous-hash linkage and recomputes each self hash.

This is a genuine ancestor of current event/custody thinking.

It is **not HMAC**. No secret key is used in this file and no ephemeral nonce is bound to each result. SHA-256 chain integrity must not be rewritten historically as authenticated HMAC receipts.

### Historical role separation

`AGENT_ONBOARDING_INDEX.md` explicitly defines:
- Yang: local implementer;
- Yin: architect;
- Bridge: integrator/coherence/drift detector.

This is direct historical evidence of role separation before current Trinity-of-Trinities vocabulary. The modern lesson is different evidence obligations over one frozen occurrence, not three agents redundantly reading the same diff.

### Continuation and externalized state

The repository contains onboarding packets, next-session documents, canonical foundation records, local JSON state, recovery plans, and validation checklists.

**Conversation context is a projection. Durable state lives outside the model and can reconstruct a fresh worker.**

## Claim audit

### “The real SDK was the @ibal reducer”
**NOT ESTABLISHED HISTORICALLY; LATER DESCENDANT IS REAL.**

No inspected original source establishes an @ibal reducer or `reducer()` backbone. The first searchable framework contract found for `IBAL-LOCAL-RUNTIME-001` is commit `6dc5f5d2da352ecd7e9fc12627d53862a040f7ef`, dated 2026-06-19.

Safe lineage: modern @ibal evolves the older practice of externalizing state and reconstructing fresh workers. Do not claim literal 2025 @ibal source without new direct evidence.

### “Every action was a PunchCard”
**ANACHRONISTIC FOR THE INSPECTED ORIGINAL; REAL LATER PRIMITIVE.**

Searchable PunchCard/Ibal/Cadence lineage becomes explicit in late August 2026:
- `d36361cb122bdecc0a1b69093a27b1c1026aa588` — Ibal/Switchboard/Cadence PunchCards, 2026-08-28.
- `83c9ef497b3180f6cb96a0f4b1702449e8bebab8` — merged consumption projection.
- `330a1b25520c7cc220c13efbbfb9f6f6c10cc47d` — PunchCard→Plan bridge, 2026-08-30.

Reuse the modern semantics: finite denominator, generation identity, evidence-required PASS, deterministic validation. Do not backdate the name.

### “Reducer compressed state to scorecard.json”
**NOT PROVEN.**

Later ScoreCard systems are real. No inspected original source establishes a universal `scorecard.json` reducer output. Do not create a new mandatory scorecard storage authority to satisfy this reconstruction.

### “Pop a bad PunchCard and re-reduce”
**PARTLY SUPPORTED AS SEMANTICS, NOT VERIFIED AS AN ORIGINAL UNIVERSAL RUNTIME.**

Historical append-only history, recovery and deterministic validation are real. Modern safer equivalent:

`immutable occurrence/evidence → replaceable current projection → invalidation → recompute → Reap/Supersede`.

### “swb_/xiio_/ib_ namespace prefixes caused hardware traps”
**UNSUPPORTED.**

Current XI-IO has typed capabilities, refs, schemas, Ward boundaries and fail-closed validators. No inspected historical source proves hardware traps from namespace prefixes.

### “HMAC-SHA256 + nonce signed every output”
**FALSE FOR THE INSPECTED HISTORICAL LEDGER.**

The ledger uses plain SHA-256 chaining. Modern device/Ward/BINS proofs are separate evolution. Integrity and authority remain different qualification cells.

### “YARS was a parent_id/message_id DAG”
**NOT ESTABLISHED IN THE INSPECTED ORIGINAL.**

The historical message sample contains `id/from/to/room/message/timestamp/type`; no `parent_id` was observed. Continuation/chronology intent is real. The exact claimed DAG implementation is unproved.

### “Patent library is sitting in the old repo”
**UNKNOWN.**

There is substantial historical code/design IP. This audit did not establish a canonical patent library. A separate IP census must distinguish code, dated invention notes, licenses/open-source releases, patent drafts/applications, third-party material and descendants. Do not market “patented” from this evidence.

## Defensible lineage

```text
00_framework / Xibalba (2025)
  local JSON + dotfiles
  onboarding packets
  Yin / Yang / Bridge
  append-only SHA-256 ledger
  recovery / continuation
  deterministic checklists
             ↓
later framework generations
  occurrences / Work
  typed refs and schemas
  generation/currentness
             ↓
@ibal / Cadence / PunchCards (2026)
  bounded worker packets
  PunchCard denominators
  ScoreCard projections
  Ollama / ACP
             ↓
Ward / BINS / Switchboard / SDK
  authority separation
  resource/version custody
  device identity
  OperationalJobs
  provider-neutral execution
  Result → RETURN → APPLY_RETURN → readback
  hostile exact-generation qualification
```

This is evolutionary lineage, not proof that modern names existed in original source.

## External comparison

The broad claim that industry frameworks are uniformly “heavy” while XI-IO alone discovered lightweight state reduction is not supported.

### Microsoft 365 Agents SDK

Official docs describe the SDK as channel plumbing: normalize messages into Activities, route them to handlers, and send responses back through channels. Microsoft explicitly says the Agents SDK is not an orchestration engine.

Sources:
- https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/agents-sdk-overview
- https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/activity-protocol

Defensible XI-IO distinction: portable Work identity, evidence, currentness, custody, admission, and return semantics, not basic channel routing.

### Apple Foundation Models

Current official docs include stateful sessions, tool calling, guided generation, transcript/call-graph inspection, context-window management, provider-swappable models, and Dynamic Profiles.

Sources:
- https://developer.apple.com/foundation-models-framework/
- https://developer.apple.com/documentation/FoundationModels
- https://developer.apple.com/documentation/foundationmodels/inspecting-session-transcripts-and-reporting-model-feedback
- https://developer.apple.com/documentation/Technotes/tn3193-managing-the-on-device-foundation-model-s-context-window

Do not market “XI-IO handles context and Apple does not.” The stronger distinction is XI-IO’s attempt to make Work/evidence/currentness/provider effects/resource custody/RETURN portable across products, providers, and hosts.

The supplied “Google loopback handlers” comparison was not precise enough to qualify. Name and test a specific official API before using it.

## What to recover into the SDK

### Recover semantics, not another ledger

1. **Append-only evidence chain.** Use current Occurrence/Work/BINS/Ward/Switchboard identities. Preserve immutable evidence and replaceable current projection.

2. **Reducible current projection.** Hydrate only current Work/occurrence, current ResourceVersions, accepted corrections/supersession, unresolved gates, current capabilities/admission, and unresolved return state. This is the evidence-supported modern equivalent of scorecard reduction. `scorecard.json` is not authority.

3. **Trinity evidence separation.** Preserve historical Yin/Yang/Bridge and current M/S/R refinement: ingress/currentness observer; execution/effect observer; return/adoption observer. None may satisfy its proof solely from another receipt’s assertions.

4. **Disposable worker/session reconstruction.** A fresh worker reconstructs from durable Work/occurrence identity, bounded current projection, exact generation, capability/admission state, and unresolved return/reconciliation state.

5. **Hash-chain semantics with modern authentication.** Historical SHA-256 chaining is valid lineage. Authentication belongs to current device/Ward/BINS authority. Digest match proves integrity against a reference, not issuer identity or permission.

### Do not recover as-is

- old passphrase-only auth as universal current auth;
- local-JSON-only persistence as universal storage;
- hard-coded historical paths;
- historical “all 10 bodies passed” claims as modern qualification;
- invented HMAC history;
- invented namespace hardware traps;
- a parallel scorecard ledger;
- a second @ibal/Switchboard orchestrator.

## Current-owner mapping

| Historical semantic | Current owner/projection | Direction |
|---|---|---|
| append-only ledger | BINS + Work/Occurrence | reuse current custody |
| reduced current state | SDK qualification + Work currentness | compile projection, no new DB |
| three-agent separation | Trinity / M-S-R qualification | different evidence obligations |
| session continuation | ACK/YAR + recovery/currentness | reconstruct disposable workers |
| local identity | CLI device/User Sphere + Ward | provider-neutral bindings |
| execution routing | Switchboard | do not rebuild in @ibal |
| authority | Ward | never inferred from hashes |
| resource bytes/provenance | BINS ResourceVersion/StorageBinding | content identity != authorization |
| current result | Result→RETURN→APPLY_RETURN→readback | preserve original Work |
| token/context pressure | @ibal bounded projection | hydrate only current required state |

## Recommended implementation canary

Do **not** start by writing a Rust HMAC block or extracting a mythical original `scorecard.json`.

Smallest useful recovery proof:

1. choose one existing Work occurrence;
2. reconstruct a fresh local @ibal worker from durable current evidence without prior chat history;
3. give it a bounded current projection rather than full history;
4. perform one read-only task through current Switchboard/Ward;
5. return Result to original Work;
6. restart the worker;
7. reconstruct the same current state from evidence;
8. prove superseded evidence does not resurrect and unresolved RETURN survives.

Acceptance:
- exact occurrence/generation preserved;
- owner relay zero across content/identity/state/action/missing context;
- no new authority;
- same current projection after restart;
- immutable history preserved;
- Result/RETURN/APPLY_RETURN remain distinct;
- current state recomputable from durable evidence.

If this passes, the historical lightweight state-reduction idea has been recovered **inside the modern architecture** instead of creating another architecture beside it.

## Marketing-safe formulation

Supported:

> XI-IO grew from a local-first architecture that externalized agent state, preserved append-only evidence, separated implementation from architectural/drift review, and reconstructed work across fresh sessions. The modern SDK extends those ideas with typed Work identity, BINS custody, Ward authorization, Switchboard execution, currentness and independently verified returns.

Not supported:

> The original 00_framework already used @ibal PunchCard reducers, HMAC-signed scorecards, hardware namespace traps and YARS DAG enforcement exactly as the modern SDK does.

## Open evidence gaps

- full branch-by-branch historical census of `00_framework`;
- exact first ancestor, if any, of later ScoreCard terminology;
- exact historical source behind YAR/YARS naming;
- whether another archive contains HMAC/device-signing experiments;
- formal IP/patent document census;
- precise genealogy through `00_xibalba_framework_blockchain` and `feb_22_2026_xi-io_framework`;
- executable comparison of historical continuation/recovery with current @ibal bounded projection.

These are research gaps, not permission to build replacement infrastructure.

## Bottom line

The old system was valuable because it treated **state, evidence, continuity and role separation as architecture**, rather than trusting one model conversation to remember everything.

The modern implementation should be:

`append-only evidence → bounded current projection → qualified worker → admitted effect → Result → RETURN → APPLY_RETURN → readback → recompute`

not a resurrection of unsupported historical names or a new parallel orchestration stack.
