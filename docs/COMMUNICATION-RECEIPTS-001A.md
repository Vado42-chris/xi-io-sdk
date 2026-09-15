# COMMUNICATION-RECEIPTS-001A

Status: source hotfix candidate, no provider/runtime/LIVE authority.

## Problem

Communication safety cannot be email-only. Incoming and outgoing email, SMS, MMS, fax, PSTN voice, VoIP/virtual calls, voicemail, chat/IM, video meetings, and webhook/notification channels all create security, privacy, legal-effect, evidence, and owner-attention risk.

A communication attempt, receive event, delivery claim, call connect, call failure, fax result, or provider uncertainty must never disappear as an unreceipted side effect. Missing evidence is not success.

## Primitive

`src/communications/receipt-ledger.mjs` adds a provider-neutral pure projection for communication occurrences and ledgers. It does not send, receive, dial, answer, fax, mutate a provider, grant authority, verify a provider receipt, or close Work.

Every accepted occurrence requires:

1. canonical occurrence identity;
2. explicit ingress/egress direction;
3. registered channel family;
4. endpoint binding;
5. explicit counterparty state, including explicit UNKNOWN;
6. Root/Work/source binding;
7. an observation receipt;
8. explicit provider/effect state where an egress attempt is possible;
9. explicit terminal outcome semantics;
10. reconciliation + wake when outcome/effect is unknown, and error + wake when failed.

The current ten channel families are:

- EMAIL
- SMS
- MMS
- FAX
- PSTN_VOICE
- VOIP_CALL
- VOICEMAIL
- CHAT_IM
- VIDEO_MEETING
- WEBHOOK_NOTIFICATION

The 10 channel families × 10 receipt requirements form the first 100-cell communication receipt matrix. Every cell remains `REQUIRES_ADOPTION_PROOF`; source existence is not runtime adoption or closure.

## Receipt layers

The contract deliberately separates receipt meanings:

- `observation_receipt_ref`: xi-io observed or ingressed the occurrence;
- `effect_receipt_ref`: an egress attempt/result transition was recorded;
- `provider_receipt_ref`: a provider-native-looking reference was supplied;
- `communication_receipt_ref`: deterministic SDK projection identity;
- `reconciliation_ref`: explicit follow-up for UNKNOWN provider effect/outcome;
- `wake_ref`: owner/worker-visible continuation for failure or uncertainty.

A supplied provider receipt remains `SUPPLIED_UNVERIFIED`. The public SDK has no provider-native verification or effect authority.

## No silent failure rules

Hard:

```text
COMMUNICATION_OBSERVED != PROVIDER_EFFECT_PROVEN
OBSERVATION_RECEIPT != PROVIDER_RECEIPT
PROVIDER_RECEIPT_REF != PROVIDER_NATIVE_PROOF
INGRESS != TRUSTED_WITHOUT_PROVIDER_EVIDENCE
EGRESS_ATTEMPT != EGRESS_PERFORMED
PROVIDER_EFFECT_UNKNOWN => RECONCILIATION_REQUIRED
FAILED => ERROR_AND_WAKE_REQUIRED
MISSING_RECEIPT != SILENT_SUCCESS
SDK_PROJECTION != EFFECT_AUTHORITY
TERMINAL_COMMUNICATION != ROOT_TERMINAL
```

For outgoing effects, `PERFORMED` cannot compile without a provider receipt reference. `UNKNOWN` cannot compile without reconciliation and a wake. A failed occurrence cannot compile without an error code and a wake.

For incoming provider events such as received fax, ringing/connected call, voicemail, delivered message, missed call, or rejected call, provider-observed states require a provider receipt reference. This remains unverified until a protected provider adapter proves it.

## Retroactive application

`auditCommunicationHistory(...)` exists for historical reconciliation. Feed historical provider observations into the audit without inventing missing evidence. Any occurrence that cannot satisfy the current receipt contract is returned as:

`RETROACTIVE_RECONCILIATION_REQUIRED`

Historical absence of a receipt must never be converted into `DELIVERED`, `COMPLETED`, `NOT_PERFORMED`, or another trusted outcome merely because the event is old.

This is intended to cover legacy mail identities, prior agent email effects, provider mail/fax logs, call histories, voicemail, virtual-call providers, messaging systems, and future registered channels.

## Runtime adoption blastwave

This source candidate is not sufficient by itself. Durable runtime closure requires the protected owners to adopt the same invariant:

```text
provider event / provider attempt
-> local observation receipt
-> Ward policy/evidence decision
-> Switchboard effect admission for consequential egress
-> provider-native result/readback receipt
-> Bins custody where evidence retention is required
-> Inbox/Studio owner-visible receipt
-> RESULT -> RETURN -> APPLY_RETURN
```

Adapters must not bypass the receipt ledger. Direct provider connectors, SDK wrappers, background workers, scheduled jobs, call/fax providers, and emergency/fallback paths all require the same receipt boundary.

## Current source boundary

This hotfix branch intentionally does not modify `package.json` or the public export map because active SDK pull requests currently own overlapping package-spine work. The primitive and hostile validator are isolated on new paths to avoid a writer collision. Package export/check-spine wiring is a required follow-up after current package writers rejoin.

No email, fax, call, message, webhook, provider mutation, deployment, or LIVE effect is performed by this ChangeUnit.
