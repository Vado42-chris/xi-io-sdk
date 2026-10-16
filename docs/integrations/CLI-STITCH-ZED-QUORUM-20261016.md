# XI-IO CLI, Stitch CLI, Zed and provider quorum contract

Status: **integration specification, not evidence of an installed Stitch plugin or a working Stitch CLI**.
Canonical work owners: SDK CLI and capability boundary; @ibal model/provider quorum; Inbox #491 internal AI Mail; Switchboard formation; Ward effects; Bins/Cube/DataForge evidence and 5.5 returns; Studio projection. This document does not introduce a second bus.

## Owner outcome
One user request in Zed or Studio, one governed quorum, no manual copy/paste between ChatGPT, Gemini, Cursor, Ollama or other workers. Free ChatGPT users can use permitted Prompt Forge prompts without requiring XI-IO cloud subscriptions. Ollama is the preferred local conductor when available; ChatGPT may be the fallback conductor only through user-authorized connected capabilities. Neither role can assume another provider's private conversation history or credentials.

## CLI responsibilities and proposed contract
The installed XI-IO CLI must be inspected before implementation. The following commands are **proposed interface targets, not claimed existing commands**:
- `xi doctor --json`: current SDK/runtime, adapter, Zed, local Ollama and service availability, no mutations.
- `xi quorum plan --work <uuid> --json`: resolve five perspectives, affected set, worker capabilities, cost/time ceiling, and quorum; no effects.
- `xi quorum dispatch --work <uuid> --fixture <sha256> --json`: route via existing Inbox/CRM and Switchboard only after resource capability ACK.
- `xi quorum return --work <uuid> --json`: independent Result, APPLY_RETURN, Bins/Cube readback and REAP.
- `xi adapters stitch probe --json`: report availability and CLI capability without claiming plugin installation.

The CLI must expose a machine-readable protocol version, actor identity, work UUID, source generation, fixture and predicate digests, requested capability, timeout, cost budget, privacy classification, admission decision, result reference and readback receipt. Never pass raw credentials or entire private histories to other providers by default.

## Stitch integration, explicitly gated
1. Discover the actual installed Stitch CLI and its official commands/version through an authorized host, never invent flags or endpoint names.
2. Register an adapter only when an executable CLI and supported auth/session are verified. Until then: `STITCH_PLUGIN=ABSENT`, `STITCH_CLI=UNVERIFIED`.
3. Map Stitch operations to capability-declared XI-IO recipe actions. Distinguish preview/read from effect-bearing create/update/export. Ward and human ACK gate effects.
4. Preserve the originating design's source generation, assets and editable outputs. A screenshot or generated image is not equivalent to a native editable design.
5. Require independently read-back output and an Inbox Result before marking Stitch work complete.
6. If Stitch is unavailable, fail typed and offer the existing qualified alternative, never silently claim Stitch was used.

## Zed single-chat experience
Zed is the user-facing ingress, not the truth database. The XI-IO Zed extension/operator submits the current project and user instruction to SDK/ibal, shows a single consolidated thread with worker provenance, receipts, conflicts and next action, and can resume from Bins/Cube on restart. No hidden provider sends. Agents cannot acquire write authority from merely being in the quorum.

## 5.5 backbeat
For each worker and generation: WHO actor; WHAT exact work/result; WHERE source/target; WHEN generation and observed timestamp; WHY user outcome. Reduce to HOW: admitted execution and independent readback. Quantize identical obligations, fractalize only distinct failures. Two observers must share one immutable fixture and predicate; disagreements are preserved. A repeated ACK is zero execution credit. Never call a recipe a component effect.

## A/B first user test
A: source recipe persists but no agent consumes it, must remain RED.
B: user requests one low-risk task in Zed, local Ollama or authorized ChatGPT conductor selects minimum quorum, Inbox delivers, worker ACKs, executes within capability, returns evidence, Bins applies exactly once, and Studio/Zed independently reads the outcome. Only B may advance the verified edge.
No provider email is sent merely to test internal AI Mail. Use synthetic internal messages and privacy-safe fixtures first.

## Runtime safety and offline continuity
On disconnection or power loss, the local queue and source refs survive; pending effects remain unexecuted until re-admitted against current pre-state. Users retain access to local work when subscriptions end. Cost/time budget and user cognitive load determine minimum quorum, not number of available plugins.

## Current qualification
This is documentation committed on an SDK feature branch. It does not install a Zed plugin, Stitch plugin, ChatGPT plugin, browser capture adapter or local runtime. It does not establish provider delivery or a Level 9 write receipt. Existing Inbox #491 and Cube 5.5 REDs remain open.
