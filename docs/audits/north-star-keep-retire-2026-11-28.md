# North-star keep/retire audit (2026-11-28, read-only)

Plain status: read-only classification of the playground and CSS surfaces against the SDK catalog. No consolidation, deletion or product change is made here. Owner decision is needed on the reference and on where reduced-motion and focus tokens live (see Decisions).

## Reproduce the SDK numbers
From the repo root: `node scripts/audit-playground-coverage.mjs`

Output on this head: UI components 27; demo entries 26; without demo: `cadence-evidence-check-widget` (its renderer is `renderCadenceEvidenceWidget`, aliased in the script; the earlier "no renderer" was a name-match error); the widget has PASS, RED and UNKNOWN states but no UNBOUND state; known gaps (not in catalog): `search-field, search-band, menu-button, popover-menu, choice-group, inline-status`. `toast` renders through `renderToastStack` (aliased in the script).

Correction: the shell brand CSS reduced-motion rules are scoped to `.app-shell.is-owner-shell` (001 and 002c), so they are not a universal policy. Generalizing them is a design decision, implemented as a draft contract on `feat/motion-focus-contract-recovery`.

The catalog's other 16 entries are compiler primitives, not UI, and are excluded from the UI denominator.

## Playground surfaces
| Surface | Evidence | Class | Action |
|---|---|---|---|
| SDK playground (`playground/`) | 26 of 27 UI components demonstrated; `validate-sdk-playground` PASS (43 primitives, 6 gaps, 0 leaks) | KEEP | Canonical reference candidate. Not approved. |
| Inbox reference playground (`xi-io-inbox/public/ui-reference-playground.*`, 523 lines) | Names 17 of 27 catalog components directly in its source (`data-primitive`, JSX tags, classes); no reduced-motion rule | RECYCLE | Harvest interaction patterns and regression evidence, then retire the page. |
| Cube workbench (`CogwheelOsPlaygroundWorkbench.tsx`, 826 lines) | Names 1 catalog component directly (`grid`) | ADOPT | Product-style workbench. Should consume SDK primitives, not be retired as a duplicate catalog. |
| Node API playground (`ApiPlayground.jsx`, 144 lines) | Names 1 catalog component directly (`grid`, a false positive from layout) | KEEP | Specialized developer API tester. Not a primitive playground. |
| Public site playground (`xi-io.net apps/public-site/src/pages/playground/`, 297 lines) | Not measured for component coverage | UNKNOWN | Public projection, to be generated from the catalog later. |
| DataForge copies of the public-site playground (2 clones) | `index.astro` and `coordinates.astro` byte-identical to xi-io.net (sha256 verified) | RETIRE | Duplicates. Retire after the public projection replaces them. |
| Four AI Studio Stitch applets | Drive snippet of HVT-2026-09-13: applets SPANNER-recorded 4 of 4; Drive projection 0 of 4; 8 local objects owner-stated, 0 read | DONOR_ONLY | Visual donors only. Bytes not independently inspected. |

## CSS and token surfaces
| Surface | Evidence | Class | Action |
|---|---|---|---|
| `brand-shell-polish-001.css` (207 lines) | Contains `prefers-reduced-motion` | RECYCLE, then RETIRE | Move the reduced-motion rule into the token source first. |
| `brand-shell-polish-002.css` (240 lines) | No reduced-motion rule | RETIRE after diff | Diff against the emitter before retiring. |
| `brand-shell-polish-002b.css` (467 lines) | No reduced-motion rule | RETIRE after diff | Diff against the emitter before retiring. |
| `brand-shell-polish-002c.css` (143 lines) | Contains `prefers-reduced-motion`, 18 focus or outline rules, no gradients | RECYCLE, then RETIRE | Keep as input for the token set. Its gate is `scripts/brand-002c-route-audit.mjs`. |
| `hex-brand-tokens.css` (208 lines) | Not yet diffed | UNKNOWN | Diff against `emit-brand-chroma-css-vars.mjs` before classifying. |
| `emit-brand-chroma-css-vars.mjs` (xi-io.net, 38 lines) | Emits brand accent, ring and surface tokens; no reduced-motion or contrast tokens | KEEP, extend | Base token source. Needs the reduced-motion and focus tokens recycled from 001 and 002c. |

## Decisions needed (owner)
1. Confirm the SDK playground as the canonical reference.
2. Decide where reduced-motion and focus-ring tokens are owned: the SDK base token set or the xi-io.net emitter. The emitter currently has neither.
3. Confirm whether the six known gaps are required before the reference is approved.
4. Confirm the cadence widget should get a playground demo.

## Not done
- No playground, CSS or product file is changed or deleted.
- The brand folders in Node, ibal and the CLI cube were not compared.
- The public-site playground's catalog coverage was not measured.
- The Stitch applets were not inspected; their bytes are not in any repository.

## Current-head receiving and functional-overlap cross-cut

This section consumes the shared executable receiving evidence rather than creating
a second primitive catalog or assuming the earlier playground audit qualifies adoption.

| Existing canonical candidate | Verified source / consumer | Disposition |
| --- | --- | --- |
| `status-badge` | SDK `src/components/core.mjs`, blob `9028ab343806c9e0fcec8232d75ff07fa3c0d2b3`; existing `renderStatusBadge` | KEEP SDK renderer |
| BINS operation outcome | Inbox #681 `public/src/ui/bins-admission-outcome.mjs`, blob `0c53eaedf7d8653d4d4f5d8aa40ae7ac88682f11` | RECYCLE semantic projection to SDK only after two independent receivers qualify |
| Evidence / receipt / next action | SDK `renderEvidencePanel`, `renderReceiptRow`, `renderNextActionStrip` in same core renderer | COMPOSE, avoid new duplicate components |
| Cadence evidence | SDK `src/cadence/evidence-check-widget.mjs`, blob `969cfbb2cca1a5aef161fa39824a27abf1646d53` | KEEP renderer, add missing playground demo and reconcile UNBOUND semantics |
| Focus / reduced motion | SDK #334 `src/accessibility/focus-motion.css`, blob `cf9954a09c13f7556317ef09603c7c41502963fd` | ADOPT with opt-in `.xiio-surface` and host isolation |
| Search/menu/choices | Catalog `src/catalog/primitives.json`, blob `6853a46229b68a3743143fc142d00b85e282e0f8` | Six existing gaps, remain unimplemented/unknown adoption |

**Executed bounded receiving evidence, exact SHA heads.**
SDK #334 `78bbd4279f694a1451ae452a25ab2805343cee5b`: local focused Node 3/3 PASS, headless Chromium computed-style/keyboard host isolation 7/7 PASS; global reduced-motion mutation caught. Hosted Check workflow 46122682395 executed successfully, with **258 TAP-reported tests / 258 pass / 0 fail / 0 skip** across 16 groups, plus other checks. This does not establish the previously reported 282-test denominator. The SDK CSS receiving proof is not Inbox CSS adoption.

Inbox #681 `2a56423d75b8f8f1518c3f110ee860fe315ee9ef`: exact Git-blob files reconstructed and executed with Node 22.16.0, **12/12 PASS / 0 skip**, including UNVERIFIED vs DENIED, unbound vs unavailable and unknown-403 refusal. Hosted preview workflow 46125885086 has zero executed steps, so its failed conclusion is PRE_RUNNER, not a code-test failure. Inbox Integrations and full host CSS remain unqualified.

**Reuse boundary.** `status-badge` and `inline-status` should consume one canonical semantic outcome classification, but neither SDK badge tone nor a product-local classifier can grant Ward authority or BINS bytes. SDK may validate/project verified outcomes; actual authority and custody remain with their producers. A shared source fixture must be exercised in at least two independent consumers before universal-adoption credit. No operation-outcome implementation or package export was added by this audit.

The existing audit's 27 UI / 26 demonstrated / six known gaps remains its stated catalog denominator. Product-local duplicate implementation counts across Node/Cube/ibal/DataForge remain **UNMEASURED**: code-search name matches and offline byte-identical copies are not an independent implementation census. No installed, merge or APPLY_RETURN qualification is claimed.
