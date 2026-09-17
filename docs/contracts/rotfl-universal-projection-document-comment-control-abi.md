# ROTFL Universal Projection Document / Comment-Control ABI

Status: ROOT EXPERIMENTAL CONTRACT. Reusable across domains. No provider, legal, billing, deployment, publication, or release authority is granted by this contract.

## Core abstraction

A single human-readable document may describe any prototype or communication surface in plain language: a court document, investor narrative, sitemap, wireframe, product plan, release brief, article, video storyboard, audio script, application flow, or another future projection.

The document has four distinct planes:

1. **Human Plane** — body/tabs contain only human-readable intent, structure, content, audience, and desired outcome.
2. **Control Plane** — comments carry machine-readable ACK / ROTFL / render / currentness / source / preflight instructions anchored to the human plane.
3. **Durable Plane** — every machine comment that matters is mirrored by stable identity into BINS/CRM/DataForge. Google comments are an interactive working projection, not the sole durable truth store.
4. **Projection Plane** — render profiles transform the same human source into `web | pdf | court | investor | slides | video | audio | app | social | email | other` outputs.

## Git-checkout metaphor

The Google Doc is the human working tree.

Comments act like machine checkouts/change units attached to exact human locations. They may describe what the machine must validate, hydrate, transform, omit, preserve, source, or render.

A comment is not itself completion. It must be consumed by the compiler/preflight and produce a durable receipt before release.

`COMMENT_EXISTS != ACK_APPLIED`

`COMMENT_RESOLVED != PREFLIGHT_PASSED`

`DOC_CLEAN != RENDER_CLEAN`

`SOURCE_PRESENT != TARGET_RENDER_VERIFIED`

## Minimal comment ABI

Each machine comment should be compact and parseable. Suggested fields:

- `kind`: `ACK | SOURCE | RENDER | PREFLIGHT | OWNER | EFFECT | PRIVACY | CURRENTNESS | RETURN | OTHER`
- `state`: `OPEN | PASS | FAIL | WAIT | N_A_WITH_REASON | RESOLVED`
- `target`: stable human anchor / tab / section / ChangeUnit
- `generation`: current source/document generation
- `refs[]`: BINS ResourceVersion / CRM KnowledgeReturn / source refs
- `render_profile`: optional target renderer/profile
- `effect_ceiling`: normally `NONE` until separately authorized
- `first_red`: optional exact blocking condition
- `wake`: optional exact wake for WAIT
- `return_target`: optional RETURN/APPLY_RETURN destination

Human-facing bodies should never need to display this grammar.

## ROTFL toggle

The root toggle is mode, not product:

### BUILD / ANNOTATED
- human body visible
- machine comments visible
- comments may be OPEN / WAIT / FAIL
- no release credit

### PREFLIGHT
- freeze document revision/generation
- compile every relevant machine comment
- resolve source/currentness/authority/privacy/render requirements
- require zero release-bearing FAIL
- require zero untyped WAIT
- emit comment-disposition receipt
- mirror durable lesson/result state into BINS/CRM/DataForge

### CLEAN CANDIDATE
- all release-bearing comments have durable disposition receipts
- working comments may be resolved/removed from the release candidate
- human body remains readable and boring
- machine control remains reconstructable from durable refs

### RENDER
- apply selected target profile
- examples: PDF layout, web component tree, video storyboard/timeline, audio script/SSML, investor deck, court form

### TARGET READBACK
- inspect the actual consumer artifact
- pagination/layout/media timing/accessibility/linking/effect boundaries are rechecked
- `RENDER_SUCCESS != TARGET_READBACK_PASS`

## Comment removal rule

Do **not** rely on export to hide comments.

The safe rule is:

`COMMENT -> PREFLIGHT CONSUME -> DURABLE RECEIPT -> RESOLVE/REMOVE FROM RELEASE CANDIDATE -> RENDER -> TARGET READBACK`

Comments may remain in the working/source document for history if desired. A clean release copy may be created from the same body after the control layer has been compiled. The release artifact must never depend on invisible/unconsumed comments.

## Why this pays rent

One plain-language source can drive many projections without duplicating the underlying intent. Domain-specific logic moves into render profiles and comment primitives instead of being copied into every product.

Examples:
- court affidavit body + evidence/law/preflight comments -> clean court PDF
- product description + IA/render comments -> website/app prototype
- investor narrative + slide/timing comments -> deck/video pitch
- article draft + channel/audience comments -> blog/social/email variants
- release plan + effect/rollback comments -> deploy preflight

This is the same ROTFL primitive at different scales.

## Hard boundaries

- Google Docs comments are a working projection, not canonical institutional memory.
- Machine comments must be mirrored by stable ref before they are removed from a release candidate.
- Resolved comments do not grant authority.
- Renderers never widen Ward/effect ceilings.
- Private/legal material cannot flow into public projections without explicit disclosure qualification.
- The human body must remain understandable if every machine comment is hidden.
- A target artifact is not release-ready until target-specific readback passes.

## First dogfood

Use one Google Doc prototype with a plain-language human wireframe and three machine comments:
1. ACK/currentness comment
2. render-profile comment
3. preflight/release comment

Then prove:
- comments can be retrieved and compiled;
- machine language is absent from the human body;
- the document can produce at least two different target projections from the same body;
- comments can be resolved/removed only after a durable receipt exists;
- final rendered artifacts contain no machine-control leakage.
