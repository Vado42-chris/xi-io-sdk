# xi-io SDK managed agent entry

This repository owns the public reusable SDK substrate. It does not own Studio user intent, framework governance, Ward policy, Switchboard effect admission, or product-domain truth.

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

## Mutation boundary

Use the smallest shared-owner patch that fixes the root contract. During hostile explosion, do not repair each failing path independently. Preserve all reds, reduce them to shared root causes, patch the semantic owner once, replay the affected denominator, then return/reap.

No external send, purchase, deployment, destructive action, or other consequential provider effect is authorized by this file.
