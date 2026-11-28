# XI-IO Universal Regression Kit, white-label adoption matrix

Status: source candidate, November 28, 2026. This is a test-consumption ledger, not a new Work database, permission system, release profile or authority to install anything.

Shared SDK owner: src/evaluation/hostile-harness.mjs, exported as @xi-io/sdk/evaluation/hostile-harness. Candidate SDK #336 extends the existing mutation engine through runWhiteLabelHostileHarness. It rejects a repeated one-product fixture, missing actual product/tenant identity in the fixture, false-green, no-op and identical mutations, and wrong-invariant refusals. Run npm run check:hostile-harness after receiving the exact SDK generation.

## Existing tests with portable invariants

| Owner and source path | Portable invariant | Action and boundary |
| --- | --- | --- |
| Switchboard tests/device-broker-exact-job-pinning.test.mjs | Original job pin, device identity, foreign device refusal and result readback without APPLY_RETURN | Candidate #126 adds alpha/beta synthetic device fixtures, product/host authority unchanged |
| CLI test/runtime-gate-transaction-verification.test.mjs | HTTP 200 is not transaction verification; bound independent readback and foreign tenant refusal | Candidate #103 adds two synthetic products and tenants, runtime untouched |
| Installer tests/test_aries_ntfs_regression.py | Requested 0755 that silently becomes 0664 refuses before copy, backup or launch | White-label candidate preserves the historical Aries/AnythingLLM witness and adds two arbitrary product identities |
| SDK test/addressable-transaction.test.mjs | CAS and exact preimage/postimage, selected resource and version, RETURN versus APPLY_RETURN | Existing generic contract, second product/tenant cohort still pending |
| BINS tests/installed-ward-destination-resolver.test.mjs | Pinned provider bytes, scope, tenant, expiry and custody readback | Generalize only shared identity/refusal assertions, BINS still owns ResourceVersion |
| Ward scripts/qualify-legal-evidence-destination-admission.mjs | Tenant-bound grant and registered-root refusal across matter and action types | Generalize tenant/expiry families, retain legal action semantics with Ward |
| Node src/lib/defaultWorkerConversationProvider.sam-contract.test.mjs | Preserve actor, worker, assignment, work and generation separately | Generic identity matrix eligible, original SAM-required tuple remains Node acceptance |
| Desktop test/samlaw-lease-workspace.test.mjs | Current source projection, corrupted tenant isolation and blocked action honesty | Add separate sanitized generic workspace fixture, preserve original product-specific witness |
| Publisher test/egress/release-handoff.test.mjs | Exact source/manifest identity, product and target binding, independent readback | Add second product identity, retain Publisher-specific served-byte checks |
| SAM_LAW tests/document-working-copy-exact-reopen-contract.test.mjs | Exact saved revision and original digest, never latest-version substitution | Universal exact-version case eligible, keep actual SAM editor and BINS transaction tests |
| Benchmark runner/test_prewrite_simulation_qualification.py | Synthetic evidence cannot certify host authority, APPLY_RETURN or installed closure | X42 owns independent scoring and test execution, SDK consumes verified results only |
| Cube native/hex/test_compose_cli_packaged_source.py | Pinned manifest, payload hash/size/mode, tampering, rollback and historical compatibility | Universal integrity family eligible, but CLI seven-file and historical 14-file counts remain Cube-specific |

## Universal test matrix

1. Two distinct product/tenant/resource coordinates, not one fixture relabeled twice.
2. Valid caller, membership and narrowly bound Ward grant; missing/foreign/expired grant denies effects.
3. Exact source generation, installer manifest pin and installed bytes, never historical substitution.
4. Actual independent ResourceVersion and receipt readback, with matching digest/size/mode.
5. Lost ACK or uncertain write blocks blind retry; durable replay proves no second effect.
6. Health, simulated PASS, GitHub source, test rendering and hosted download cannot self-certify live installation.
7. Failure preserves previous generations and user data; rollback has independent verification.
8. Return, APPLY_RETURN, consumed return and next-worker acknowledgement are separate states.
9. Foreign device, job, product or tenant cannot satisfy a pinned target.
10. Missing tests, no-op mutants, repeated identical mutants and wrong refusal reasons do not count as coverage.

## Adoption and reporting

The SDK owns reusable parameterized hostile families. Each product still owns its real transport/runtime tests, unique executable protocol, CLI commands, API endpoints and host-admission checks. Do not invent a new database, adapter, authority, runner or package source to make this matrix green.

Every receiving PR must give the exact source head, test command, interpreter version, exit code, denominator and first actual failing gate. Reread source after committing; an earlier green verdict does not qualify a changed generation. Host-qualified authority and a real installed result require their own independent receipts.

Current disposition: SDK #336, Switchboard #126, CLI #103 and the Installer candidate are draft changes. Broader source candidates above are not yet migrated. No BINS receipt, Ward grant, qualified download, installed Aries release, RETURN or APPLY_RETURN is claimed. Project/Docket/Work/WorkerAssignment are UNBOUND to this session.
