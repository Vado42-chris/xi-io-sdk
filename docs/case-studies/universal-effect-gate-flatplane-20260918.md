# Synthetic Case Study - current effect gate + ROTFL template composition

Classification: public-safe synthetic SDK case study.

## Trigger

A generic agent receives an executable current directive while ACK/template/runtime paths and multiple internal/external effect surfaces are available.

The historical donor demonstrated exact-current effect gating, but current SDK main later added ROTFL template execution. Keeping either one alone creates split-brain:

```text
EFFECT_POLICY_ONLY != ACK_RUNTIME_COMPLETE
ROTFL_TEMPLATE_ONLY != EFFECT_POLICY_COMPLETE
```

## Repair method

1. freeze the effect-scope denominator;
2. preserve the current ROTFL template-runtime denominator;
3. require exact current-instruction provenance for consequential effects;
4. bind exact occurrence;
5. bind exact requested effect;
6. keep SDK effect authority false;
7. project the same policy into internal-agent message envelopes;
8. hostile-test missing/stale/wrong-effect policy;
9. hostile-test incomplete ROTFL template runtime;
10. run the complete SDK runtime ROTFL suite and read back exact current main.

## Synthetic denominator

15 effect scopes:

EXTERNAL, INTERNAL, INTER_APP, INTER_DEPARTMENT, API, SDK, ACK, PROVIDER, CRM, SWITCHBOARD, REPOSITORY, DEPLOYMENT, MESSAGE, FILE_MUTATION, OTHER_CONSEQUENTIAL.

Minimum effect hostiles:

- exact-current exact-effect -> user gate bound;
- stale/different instruction -> fail;
- same instruction wrong effect -> fail;
- caller claims SDK effect authority -> fail;
- NO_EFFECT preparation -> no attempt eligibility.

Minimum runtime hostile:

- terminal ACK with incomplete template runtime -> fail.

## Lesson

```text
FRAMEWORK RULE EXISTS
!= SDK MAIN CONSUMES IT
!= ADOPTERS CONSUME IT
!= RUNTIME REPLAY PROVEN

GREEN LOCAL UNIT != GREEN AFFECTED DENOMINATOR
CI RED ON A CONSUMER = AFFECTED-SET DISCOVERY
```

The historical PR #79 is donor evidence only. This case study describes the composed current-main implementation, not resurrection of the stale branch.
