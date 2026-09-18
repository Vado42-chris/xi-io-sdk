# ROTFL Universal Projection Document / Comment-Occurrence Ingress ABI

Status: ROOT EXPERIMENTAL CONTRACT. Reusable across domains. No provider, legal, billing, deployment, publication, or release authority is granted by this contract.

Compatibility note: the historical path retains `comment-control` in its filename. **A comment is not the control plane.**

## Core invariant

```text
NOTHING LIVES IN A COMMENT

COMMENT = EPHEMERAL OCCURRENCE / INGRESS / PROVENANCE
COMMENT != WORK
COMMENT != CURRENT STATE
COMMENT != CONTROL PLANE
COMMENT != MEMORY
COMMENT != AUTHORITY
COMMENT LINK != REQUIRED USER PATH
```

A comment may be read to discover a material delta. Once discovered, the delta must leave the provider comment and enter its canonical owner before it can influence current state, work selection, release, or the User's required path.

## Four planes

A human-readable document or communication surface may participate in four distinct planes:

1. **Human Plane** — body/tabs contain human-readable intent, structure, content, audience, and desired outcome.
2. **Occurrence Ingress Plane** — comments, review threads, annotations, chat turns, or similar provider events are transient observations. They may trigger classification, never become canonical state.
3. **Durable Control / Memory Plane** — Work, requirements, decisions, SourceOccurrence, QueryEvent, CRM/KnowledgeReturn, BINS/DataForge evidence, currentness, RETURN/APPLY_RETURN, and owner projections hold durable state under their existing owners.
4. **Projection Plane** — render profiles transform the same canonical human intent/state into `web | pdf | court | investor | slides | video | audio | app | social | email | other` outputs.

## Mandatory egress from a material comment

```text
PROVIDER COMMENT OCCURRENCE
-> CAPTURE identity + subject generation + digest/ref
-> CLASSIFY materiality
-> COLLIDE with existing canonical owner
-> PROMOTE material delta into canonical state
-> READ BACK canonical target/current generation
-> PROJECT human-readable current state
-> REAP / RESOLVE provider carrier
-> CONTINUE from canonical state
```

Material outcomes route by meaning, not by provider:

```text
action/obligation  -> existing Work / requirement / bug / decision / dependency owner
lesson             -> KnowledgeReturn / institutional learning
evidence           -> durable evidence/source ref
communication      -> AI-mail / CRM event where applicable
currentness        -> canonical currentness projection
result             -> RESULT -> RETURN -> APPLY_RETURN
```

If no canonical owner can be resolved, the occurrence remains a typed `UNKNOWN_BLOCKED` ingress item. It does not become an implicit task living in the comment thread.

## Commentless User × Experience canary

For any current User-facing or worker-facing surface, ask:

> If every provider comment disappeared right now, could the User still understand the current state, why it matters, who/what owns it, what happens next, and where the proof lives?

Required current-state cells:

```text
CURRENT_STATE_VISIBLE
WHY_IT_MATTERS_VISIBLE
OWNER_OR_WORK_VISIBLE
NEXT_ACTION_OR_TERMINAL_VISIBLE
PROOF_LOCATABLE
CURRENT_GENERATION_VISIBLE_OR_RESOLVABLE
```

All required cells must be known true for a comment-independent current-state PASS.

```text
CURRENT_STATE_REQUIRES_COMMENT_READ -> UX_FAIL
COMMENT_UNAVAILABLE_AFTER_VERIFIED_PROMOTION -> NO_EFFECT_ON_CURRENT_STATE
```

A comment link may appear in progressive disclosure as provenance. It may never be the only way to recover required state or action.

## Provider adapter shape

When a provider comment exists, an adapter may capture bounded occurrence metadata such as:

- provider occurrence identity;
- exact subject/anchor;
- subject generation;
- digest or opaque source ref;
- material classification;
- owner/project hint;
- provider-native readback evidence.

Those fields are ingress evidence only. Canonical state must live on the resolved owner surface.

Raw private comment bodies are not portable state and should not be copied into reusable/public contracts.

## Build / preflight / release behavior

### BUILD / ANNOTATED

- comments may exist as temporary collaborative input;
- every material comment is immediately eligible for egress/collision;
- an unresolved material occurrence remains visibly undrained;
- no release/currentness credit comes from the provider comment itself.

### PREFLIGHT

- freeze the selected canonical human source/generation;
- require zero undrained material comment occurrences;
- require durable canonical projection/readback for every material occurrence;
- require the commentless User × Experience canary;
- emit exact unresolved UNKNOWN/WAIT rather than hiding comment residue.

### CLEAN CANDIDATE

- canonical state is reconstructable without provider comments;
- comments may be resolved or deleted without semantic loss;
- human-readable projection remains complete;
- durable control/memory remains reconstructable from canonical refs.

### RENDER / TARGET READBACK

Render from canonical human/control state, never from hidden provider comments.

`RENDER_SUCCESS != TARGET_READBACK_PASS`.

## Comment removal rule

The safe rule is:

```text
COMMENT
-> CAPTURE OCCURRENCE
-> PROMOTE MATERIAL DELTA
-> CANONICAL READBACK
-> COMMENTLESS UX CANARY
-> REAP COMMENT CARRIER
```

The system must not retain a provider comment merely because deleting it would otherwise erase current state. If deletion would erase state, promotion was incomplete.

## Why this pays rent

Provider comments remain useful for collaboration without becoming another hidden database, task graph, memory system, or User interface.

The User gets one current surface rather than archaeology across GitHub, Google Docs, Slack, chat, or review threads. Agents receive compact canonical state instead of loading comment history into context.

This also makes provider migration cheap: the durable state survives even when the original comment system disappears.

## Hard boundaries

```text
COMMENT_BODY != CURRENT_STATE
COMMENT_THREAD != CONTROL_PLANE
COMMENT != MEMORY
COMMENT != WORK
COMMENT_RESOLVED != WORK_TERMINAL
COMMENT_PROMOTED != COMMENT_REAPED
COMMENT_LINK != REQUIRED_USER_PATH
MATERIAL_COMMENT_WITHOUT_CANONICAL_PROJECTION != DRAINED
CURRENT_STATE_REQUIRES_COMMENT_READ -> UX_FAIL
COMMENT_UNAVAILABLE_AFTER_VERIFIED_PROMOTION != BLOCKER
RAW_COMMENT_BODY != PORTABLE_STATE
PROVIDER_COMMENT_HISTORY != INSTITUTIONAL_MEMORY
```

Private/legal material remains under its owning privacy/disclosure controls. Renderers never widen Ward/effect ceilings.

## First reusable hostile set

1. actionable comment has no canonical owner projection -> BLOCK;
2. comment resolved while canonical Work remains open -> no terminal credit;
3. comment is deleted after verified promotion -> current state unchanged;
4. stale comment conflicts with newer canonical generation -> canonical generation wins;
5. duplicate provider comments -> one semantic projection, no duplicate Work;
6. User must open comment to discover next action -> UX FAIL;
7. cold worker requires comment archaeology after durable promotion -> onboarding FAIL;
8. evidence-only comment -> evidence ref, no task minting;
9. lesson remains only in comment -> institutional-learning FAIL;
10. provider disappears after canonical promotion -> current state remains usable.

The destructive proof is #3 and #10: **remove the comment/provider and the system still works.**
