# Synthetic Case Study — Flatplane repair for universal effect gating

Classification: public-safe synthetic SDK case study.

## Trigger

A generic agent is asked to prepare work, later receives an explicit current instruction for one exact consequential effect, and has access to multiple internal/external effect surfaces.

Risk: a model or adapter may incorrectly treat prior approval, a matching instruction ID, an ACK, an internal message, or a provider-capable tool as blanket authority.

## Flatplane repair method

1. Freeze effect-scope denominator.
2. Separate preparation from consequence.
3. Require current-instruction provenance.
4. Bind exact occurrence.
5. Bind exact requested effect into the current instruction's authorized effect set.
6. Keep effect authority false in the SDK projection.
7. Project the same rule into affected ACK/internal-message consumers.
8. Run exact-current and wrong-effect hostiles across every scope.
9. Run full repository CI.
10. Stop at independent review / merge admission, not at prose explanation.

## Synthetic denominator

15 scopes: EXTERNAL, INTERNAL, INTER_APP, INTER_DEPARTMENT, API, SDK, ACK, PROVIDER, CRM, SWITCHBOARD, REPOSITORY, DEPLOYMENT, MESSAGE, FILE_MUTATION, OTHER_CONSEQUENTIAL.

Each scope must pass two minimum hostiles:
- exact-current exact-effect -> user gate bound;
- same/prior instruction but wrong/stale effect binding -> WAIT.

## Blastwave found by CI

Initial ACK enforcement broke existing baseline CLI fixtures because they emitted ACKs without an effect policy.
After repair, full CI progressed further and found internal AI-mail as another affected consumer.
That consumer was patched to project the same effect policy rather than weakening the ACK validator.

Lesson:

GREEN LOCAL UNIT != GREEN AFFECTED DENOMINATOR.
CI RED ON A CONSUMER = AFFECTED-SET DISCOVERY, NOT A REASON TO ROLLBACK THE INVARIANT.

## Result

- generic scope canaries passed;
- baseline CLI consumer patched;
- internal AI-mail consumer patched;
- full SDK Check passed;
- Local Static Scan passed;
- SDK still grants no effect authority.

## Reusable tool/skill implications

- cold-start compilers should surface current effect gate state before action selection;
- ACK validators should reject missing/stale/wrong-effect policy;
- internal agent mail must consume ACK policy rather than bypass it;
- community/peer review remains separate from runtime/CI success;
- case-specific/private material is not required for generic qualification.
