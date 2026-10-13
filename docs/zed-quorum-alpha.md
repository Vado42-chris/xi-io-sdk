# Zed external quorum surface (alpha)

`xi-quorum-acp` connects an ACP client to the existing local controller and AI Mail. It starts no HTTP or model server. Zed is the alpha default; the protocol adapter can also be used by another compatible editor.

Prerequisites: Node 22+, a compatible `@agentclientprotocol/sdk` installation (validated with the installed Ibal SDK 1.3.0), controller on 127.0.0.1:8798, and the local agent on 127.0.0.1:3109 with conversation-context support. The CLI reuses `~/.local/share/xi-io/agents/ibal-acp-001a/acp-agent` by default. Set `XIIO_ACP_SDK_ROOT` to another directory containing its package.json and SDK dependency.

Configure a Zed custom agent with Node as `command` and the absolute path to `bin/xi-quorum-acp.mjs` as its sole argument. Optional environment variables:

- `XIIO_QUORUM_STATE_DIR`: writable session metadata directory.
- `XIIO_QUORUM_THREAD_REF`: canonical shared AI Mail thread; otherwise each new session gets its own thread.
- `XIIO_AI_MAIL_LEDGER`: existing canonical AI Mail JSONL ledger.
- `XIIO_CONTROL_URL` and `XIIO_LOCAL_AGENT_URL`: loopback HTTP endpoints only.

Commands: `/help`, `/quorum`, `/history`, `/participants agent:one,agent:two`, `/send message`, `/assign agent:seat task`, and `/advance`. Ordinary text talks to local Ibal with context from this thread only. Assignment and advance use the controller's existing rules; advance explicitly prefers the Zed seat. Commands do not bypass admission or supply provider credentials.

Messages are persisted through the controller and checked against the full canonical ledger. Session files hold only thread identity, workspace, selected recipients and timestamps. Resume reads AI Mail; new messages are polled every ten seconds. The adapter rejects conflicting copies of a message and refuses context-bearing inference against older agents. The local agent excludes legacy workspace-wide chat memory for bound conversations.

Delivery to AI Mail is not worker execution. This adapter does not automate proprietary provider chat tabs, register their consumers, or open native Desktop windows. Each selected seat still needs a working consumer and must return evidence on the same thread. Registered presence is not a heartbeat. An ACP transport test is not visual Zed proof.

Validation: `npm run check:quorum-acp` exercises isolation, full-body replay, recipient validation, Zed preference, reply deduplication, resume, and failure paths. `validate-local-agent-http.mjs` checks context validation with the live loopback HTTP server and a fixture model. Real client integration must additionally exercise ACP initialize, new session, prompt, notifications and load using the installed protocol SDK.
