# Compass receiver identity qualification

## Owner and affected consumers

The existing `src/compass/local-truth.mjs` default probe is consumed by both
`runtime.ollama` and `runtime.api_glass_box` in `compileLocalCompass`.
Configured receiver identity must survive the HTTP request. A redirect target's
200 response cannot establish reachability of the originally configured reader.
This consumes the no-redirect boundary already used by SDK onboarding/current;
it does not create another transport registry, authorization grant or provider.

## Reproduction and repair

Against accepted SDK generation `d10a6160cc32e9fe07c9c048dd514e0a7d7e1aa6`,
the default fetch followed 301, 302, 303, 307 and 308 responses. Two disposable
HTTP servers reproduced each case. The second server received both diagnostic
requests, and its synthetic JSON made both original receiver cells report PASS.
No credentials or user data were used.

The existing default probe now requests `redirect: 'error'`. Existing exception
handling retains `WAIT_UNREACHABLE` for the observation and RED for each affected
compass cell. Direct 200 and direct 503 behavior remains unchanged. Configured
URLs and existing environment bindings are not broadened or silently replaced.

`test/compass-receiver-identity.test.mjs` executes the real default fetch through
`compileLocalCompass`, not an injected probe. Only unrelated repository/runtime
inspection is isolated. It measures both diagnostic consumers, all five redirect
statuses, zero replacement-server requests, the direct-success control, and the
direct-HTTP-refusal control. The source baseline passes 2/7; the repair passes 7/7.

The existing `npm run check:cli-compass` command runs the original 100 hostile
cases and this seven-case test. The existing `check:raw` denominator invokes
that command, so the runtime ROTFL full check cannot silently skip the new file.

## Qualification ceiling

These tests prove diagnostic receiver continuity in disposable HTTP execution.
PASS here remains an HTTP observation, not authenticated provider identity,
current installed generation, semantic service readiness or effect authority.
`provider_effect` and `authority_granted` remain false. This does not qualify DNS
address pinning, remote Ward/Switchboard execution, a custom injected probe, or
live model/chat/document operations. Full-suite and accepted-main evidence must
be recorded by the accepting carrier; this document does not manufacture either.

## Current consumer classification

The actual default-probe consumers `runtime.ollama` and `runtime.api_glass_box`
are AFFECTED and executed by the regression. Injected custom probes are outside
this implementation and are not qualified by this change. Other product adoption
is UNKNOWN until its concrete owner import/generation is independently checked.
Studio relationship graph blob `94816acdce4f7baf6550a4a6a1394b27f453a6d4`
remains `complete:false`; denominator blob
`4d35947148ec03c765105da31366e3b5263081fc` is not a claim of complete adoption.
No roster or product-wide closure is inferred from this bounded two-consumer test.

## Executed candidate qualification

The complete `npm run check` exited zero in the cloud workspace. Its existing
runtime ROTFL denominator passed 108/108 commands, including
`npm run check:cli-compass` with the original 100 controls plus all seven real
HTTP receiver tests. Outer package checks also completed. The exact accepted
baseline tree and signed commit were restored for exact-ref installation tests;
no ancestry or credentials were fabricated. Test-only XDG state and npm cache
were isolated under disposable paths. Generated runtime output is not promoted
into a claim of installed updated SDK or live provider execution.
