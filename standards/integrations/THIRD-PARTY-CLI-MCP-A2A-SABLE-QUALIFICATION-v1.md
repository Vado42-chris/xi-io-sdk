# XI-IO third-party CLI, MCP, A2A and Sable qualification standard (candidate v1)

Owner: SDK (CLI and tool contracts). Ward owns effect authorization, Bins owns evidence, Switchboard owns orchestration, Inbox #491 owns agent transport, Studio/Sable owns user-visible preview. No second truth database.

## User outcome
From Zed or Studio, one request selects an existing tool, installs/qualifies it when authorized, executes a bounded action, shows its result in Sable, and returns independent evidence without owner relay. The future boot-time disk doctor is a separate privilege tier, not implied by current CLI support.

## Mandatory 5.5 denominator, applied per action
1. WHO: authenticated principal, actor, session, assignment and consumer identity.
2. WHAT: exact requested operation, target, artifact type and expected output.
3. WHERE: canonical repo/host/OS/runtime/working directory, plus trust boundary.
4. WHEN: source generation, tool version/digest, lease, timeout and replay key.
5. WHY: user objective, necessity, privacy class and blast-radius budget.
5.5: compare all five against current source and opposing evidence, reduce to one A/B executable action, preserve UNKNOWN, and refuse stale or duplicated claims.
6 HOW: independently authorized call at the physical effect sink, post-effect readback, Result, Inbox/Bins RETURN, idempotent APPLY_RETURN and REAP.

## Tool qualification gates
- Discover canonical publisher, license, signed/tagged release and immutable commit/package digest. No unpinned curl-to-shell.
- Inspect dependency tree, permissions, secret handling, network destinations, filesystem writes, subprocesses, update mechanism, prompt injection/tool-shadowing risks and license.
- Classify capabilities: read-only, workspace-write, provider-write, terminal, privileged-repair. Each needs distinct Ward admission.
- Separate tool description from executable adapter. Verify installed binary with actual version/help/doctor output.
- CLI contract: discover, inspect, plan, simulate, admit, execute, readback, return, rollback. Unsupported verbs return typed errors, never a fake PASS.
- A2A: identity and work lease precede message; delivery receipt != consumption ACK != execution Result != APPLY_RETURN.
- MCP: canonical namespaced tool identity; deny untrusted annotations and prompt-injected instructions; per-tool scopes; bounded time, resource and network limits; sanitized logs.
- Sable preview: read-only by default, render actual artifacts, editable source changes must pass Ward and have reversible receipts; no image-only substitute for a working widget.
- Native rescue tier: boot failure, offline operation, immutable recovery image, signed binaries, rollback partition/snapshot, human physical-presence approval for destructive disk repair. No automatic kernel-level mutation from chatbot text.

## First A/B acceptance fixture
A: registered Stitch recipe without installed/verified CLI. Expect WAIT_TYPED/NO_EFFECT, no Sable claim of functional editor.
B: same immutable fixture, authenticated and version-pinned CLI with admitted sandbox operation; verify command exit, artifact digest, Sable readback and Inbox Result. Only the verified edges advance.

## Source intake, not installation approval
- Stitch CLI workspace/project pairing, priorities/context, codebase prototypes and command reference, user-supplied documentation URLs.
- SRE-Bench (arxiv 2608.11469v2), PhotoCraft, FilmCraft, Nigel, Reverse Engineer Anything, Universal Modder. Evaluate each separately, do not auto-install.
- Wiz Inside MCP Security research, nine-page user-supplied transcription: local arbitrary-code risk, remote pivoting, registry impersonation, tool shadowing, prompt injection, credential exposure and cross-tool escalation. This is historical source material, not independent 2026 validation.

## Machine receipt requirements
{work_uuid, actor_ref, assignment_ref, tool_id, tool_digest, source_generation, target_ref, operation, pre_sha256, ward_admission_ref, execution_id, exit_code, post_sha256, independent_readback_ref, inbox_result_ref, apply_return_ref, rollback_ref, verdict}

Absent any effect proof: SOURCE_ONLY / UNKNOWN, not PASS. Every gate must be binary where evidence permits, otherwise explicit UNKNOWN. Repeated equivalent obligations may be QUANTIZEd into denominators; materially distinct FAIL/UNKNOWN may be FRACTALIZEd. Do not infer physical proofs or production readiness from numerical simulations.

## Required initial test
Run SDK doctor on exact native host, inventory Zed plugin and Stitch CLI installed state, inspect the canonical tool version, run one no-effect fixture, then one authorized local sandbox artifact generation and Sable readback. Route the result through existing Inbox #491 and Studio. No user-mediated copying.
