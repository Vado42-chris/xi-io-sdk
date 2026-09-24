# API Blackhole Proof Envelope v1

Status: candidate contract for PNEUMA proof-integrity hardening.
Owner: SDK #144 proof-integrity / API Glass Box containment.
Effect authority: 0.

## Purpose

The API blackhole is not a new runtime authority and not a substitute for Aries/Loki physical readback. It is a containment envelope for claims that look executable but are not yet proven against the owner-usable local substrate.

It prevents this false promotion:

```text
PROSE_CLAIM -> LOCALHOST_TEXT -> GREEN
```

and requires this chain instead:

```text
CLAIM -> BLACKHOLE -> HOSTILE_CLASSIFICATION -> REQUIRED_NATIVE_RECEIPT -> RETURN -> APPLY_RETURN -> READBACK
```

## Hard invariants

```text
PROSE_CLAIM != PHYSICAL_EXECUTION
LOCAL_LOOPBACK_SOCKET_REACHABLE != PHYSICAL_HOST_EXECUTION
SANDBOX_FIXTURE_PASS != API_GLASS_BOX_RECEIPT
SYNTHETIC_TRANSCRIPT != NATIVE_RECEIPT
SLACK_THREAD != LOCAL_TRUTH
GITHUB_COMMIT != LOCAL_TRUTH
TOOL_CALL_TEXT != FILE_MUTATION\nWRITE_ACK != POST_WRITE_READBACK\nPATH_TRAVERSAL_OUTSIDE_SCOPE = FAIL\nAPI_BLACKHOLE != PASS
```

## Required envelope fields

```json
{
  "schema": "xiio.api-blackhole.proof-envelope/v1",
  "packet_id": "string",
  "source_generation": "string",
  "claim_text_digest": "sha256:string",
  "claim_kind": "PROSE|SCREENSHOT|SYNTHETIC_LOG|LOCALHOST_TEXT|TOOL_CALL_TEXT|CONNECTOR_READBACK|NATIVE_RECEIPT",
  "producer_surface": "CHATGPT|GEMINI|ZED|SLACK|GITHUB|ARIES|LOKI|OTHER",
  "execution_surface": "SANDBOX|REMOTE_CONNECTOR|ARIES|LOKI|UNKNOWN",
  "transport_state": "PASS|FAIL|TRUE_WAIT|UNKNOWN",
  "proof_scope": "SYNTHETIC_FIXTURE|CONNECTOR_METADATA|HOME_CURRENT|NATIVE_RUNTIME",
  "first_red": "string|null",
  "required_receipts": ["string"],
  "blocked_promotions": ["string"],
  "authority_granted": false,
  "provider_effect": false,
  "legal_effect_authority": 0
}
```

## Promotion rule

Promotion requires `claim_kind=NATIVE_RECEIPT`, `proof_scope=NATIVE_RUNTIME`, exact source-generation parity, authenticated and fresh receipt state, replay=false, independent readback, and distinct producer/verifier identities. Tool-call-shaped text never promotes itself, even when a later native receipt exists; the native receipt is the promotable claim. Target paths, when present, must normalize inside the admitted target scope. Everything else remains PASS/FAIL/TRUE_WAIT for analysis only. A `TRUE_WAIT` may be useful and counted as an occurrence, but it may not become runtime credit.

## Gemini/Zed hostile added 2026-09-24

A sandbox or LLM-visible localhost claim must remain contained even when the local loopback socket is reachable inside the test harness. The SDK truth bench therefore includes `GEMINI_SANDBOX_LOCAL_SOCKET_THEATER`, which must remain:

```text
state=TRUE_WAIT
first_red=SYNTHETIC_STATE_ROOT_NOT_PHYSICAL_READBACK
false_green=false
```

This is the PNEUMA proof-integrity containment seam for API Glass Box work until Aries or Loki returns an authenticated native receipt.


## Live-fire Zed drift hostile, 2026-09-24

A full conductor response was relayed to Zed and produced tool-call-shaped text targeting an unrelated path (`/a/b/backend/src/main.rs`). That occurrence is classified as out-of-scope target drift, not execution. The executable evaluator and hostile bench require the normalized target path to remain within admitted prefixes and keep `TOOL_CALL_TEXT` contained until an independently verified native receipt exists.
