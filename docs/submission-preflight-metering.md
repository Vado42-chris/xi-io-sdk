# Submission preflight: planning is not usage

Owner: existing `@xi-io/sdk/evaluation/submission-preflight` export.
This is a correction to the existing primitive, not a scheduler, ledger, billing
service, worker registry, or replacement ACK.

## Contract

`compileSubmissionPreflight` is a pure calculation. It cannot observe a new
simulation, start a provider attempt, prove avoided spend, or authorize billing.
Its output is now `xiio.sdk.submission-preflight/v3`; its meter is
`xiio.sdk.metered-execution/v2`, with the predecessor schemas retained as
`legacy_schema` only.

The meter records `measurement_basis=PREFLIGHT_PLAN_ONLY`,
`measurement_scope=THIS_COMPILATION_ONLY`, and
`proof_state=SUPPLIED_UNVERIFIED`.

| Field | Meaning |
| --- | --- |
| `planned_local_sim_units` | Proposed local work, not completed simulations |
| `planned_provider_attempt_units` | Proposed eligible provider work, not executed attempts |
| `withheld_planned_provider_attempt_units` | Proposed work withheld by preflight, not measured savings |
| `local_sim_units`, `provider_attempt_units` | Always zero for this pure compilation |
| `prevented_provider_attempt_units` | Always zero; no counterfactual savings are verified |
| `chargeable_units`, `provider_effect_units` | Always zero for this compilation |
| `billing_authorized` | Always false |

These zeros describe this function's effects, not the entire host's usage. Actual
accounting remains with the existing admitted execution meter and its native
occurrence/readback, generation and duplicate-handling contracts. Do not add
planned quantities over repeated wakes. A pricing reference is not a price quote.

## Adopter migration and exact next action

1. Resolve current accepted SDK main and the candidate head before each pass.
2. Inspect this module, `scripts/validate-submission-preflight.mjs`, and the
   unchanged provider classifier `src/providers/state.mjs` at that exact head.
3. Run `node --check src/evaluation/submission-preflight.mjs` and
   `node scripts/validate-submission-preflight.mjs`. The latter prints every
   named result, actual test count and failure count and exits nonzero on failure.
4. Existing framework, Studio, Inbox, Articles and Publisher consumers must
   display planned quantities as plans, not completed work, chargeable usage,
   monetary savings or earned gamification. Consumers of either predecessor
   schema require explicit migration and a same-generation consumer replay.
5. Preserve the existing `xiio.hotfolder.ready.v1` / `WAKE_ONLY` envelope.
   Supply no new scheduler or effect authority. Read back the native consumer
   before claiming its adoption, billing behavior or LIVE state is corrected.
6. RETURN the exact source/test blobs and consumer result to the owning existing
   Work; APPLY_RETURN and read back before selecting NEXT. A source test does
   not close an absent consumer or independent-review gate.

## Qualification and limits

Original source at `00998897b8c0190a9c50a5e02f8ee5d81dc656ef` returned one
`local_sim_unit` and one `provider_attempt_unit` from a single pure call. No
simulation or provider attempt was executed by that call. Its original eight
checks passed, demonstrating the missing test boundary.

The replacement suite preserves eight routing/ACK cases and adds ten usage
hostiles, including 100 identical compiler calls and ten repeated billing holds.
Those are replay counts inside tests, not worker counts or production credit.

Input refs and shaped ACKs remain supplied data. This patch does not authenticate
ACKs, establish host independence, prove provider currentness, verify legal
facts, or authorize messages, filing, service, oath, publication or deployment.
`READY_FOR_PROVIDER_SUBMISSION` remains an advisory routing result, not authority.

## Bounded fallback

If local Git network access fails, retrieve the exact files through an admitted
repository connector and verify each Git blob digest before local execution.
Do not replace source with a guessed implementation. If hosted jobs are refused
before execution, preserve the provider reason and continue these effect-free
local checks; do not loop hosted retries or call the source failed. A historical
successful run is not proof of present billing status. Before opening a PR,
verify its branch exists and the intended bounded diff is present.

`SOURCE_FIX != ADOPTER_REPLAY != RUNNING != LIVE`.
