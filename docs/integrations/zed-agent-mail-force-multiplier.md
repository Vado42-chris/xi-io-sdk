# Zed as the xi-io operator front door (candidate)

**Existing owners only:** SDK = MCP/CLI adapter; Inbox #491 = CRM/AI Mail source; Switchboard = quorum/routing; Ward = effect admission; Bins/DataForge = provenance and return; Studio = human UI. This does NOT create another mail bus or principal registry.

## Install and test on the authorized local machine

Requirements: Node.js 22+, Zed with MCP support, reachable **local** Inbox CRM runtime on port 8794. Local commands:
```sh
cd /absolute/path/to/xi-io-sdk
node scripts/check-zed-inbox-mcp.mjs
npm link
xi-zed-mcp
```
The last command is an MCP stdio server: it waits for JSON-RPC. Silence at the terminal does not mean failure. Do not run it as a web server.

Merge the following into the existing Zed settings (do not overwrite other settings):
```json
{
  "context_servers": {
    "xiio-inbox": {
      "command": "xi-zed-mcp",
      "args": [],
      "env": {
        "XIIO_INBOX_LOOPBACK_URL": "http://127.0.0.1:8794",
        "XIIO_ZED_ALLOWED_MAILBOX": "agent+yin@xi-io.net",
        "XIIO_ZED_CONSUMER_REF": "agent:yin",
        "XIIO_ZED_OBSERVER_ID": "yin"
      }
    }
  },
  "agent": {
    "tool_permissions": {
      "default": "confirm"
    }
  }
}
```
Replace the example mailbox/consumer/observer with an authenticated, assigned real local actor. The values restrict routing but **are not proof of authentication or Ward authority**. Do not configure arbitrary target identities for an untrusted external agent.

In this SDK worktree, Zed's `task: spawn` also exposes `XI-IO: Zed + CRM live readiness` and `XI-IO: MCP protocol hostile (mock Inbox)` through `.zed/tasks.json`. The readiness task intentionally exits nonzero when Zed or the real CRM is absent. It never installs or modifies host tooling.

Zed UI: Settings → AI → MCP Servers must show `xiio-inbox` active. Use Zed's native Agent Panel to invoke `xiio_inbox_health`, `xiio_agent_mail_list`, `xiio_agent_mail_qualify`. Inspect `dev: open acp logs` for external-agent forwarding. Zed may NOT forward native MCP tools automatically to every ACP external agent; this needs separate live proof.

**Existing Inbox dependency:** `xiio_agent_mail_qualify` requires `POST /api/control-loop/agent-mail/qualify-consumption`. It is on Inbox candidate branch `fix/agent-mail-consumption-55-20261011`, **not qualified or live on current main**. If unavailable, the bridge emits a typed `INBOX_HTTP_404` or `INBOX_UNREACHABLE`, not a worker ACK. CRM persistence is NOT authoritative provider currentness. The Inbox candidate currently fails closed.

## Executable bridge boundary

`bin/xi-zed-mcp.mjs` speaks MCP over stdio, denies non-loopback HTTP endpoints and cross-mailbox/observer requests, times out, never persists secrets, and exposes three bounded actions:
- `xiio_inbox_health`: local control-loop status metadata.
- `xiio_agent_mail_list`: metadata-only read of an `agent+...@xi-io.net` mailbox. Message subject/body/card are explicitly not returned.
- `xiio_agent_mail_qualify`: forward exact consumer/generation/observer to existing Inbox qualification API. **No execution, delivery, Ward admission or Level 9 credit**.

## Four upstream force multiplier qualifications

| Source | Actual contract | Zed path | XI-IO owner | First hostile |
|---|---|---|---|---|
| zed-industries/zed | ACP external agents + local/remote MCP + tool permissions | Host Editor; one MCP context server | SDK + Studio | MCP tool visible and callable in Zed; ACP forwarding independently tested |
| morluto/rea | REA reverse engineering via MCP/CLI; Linux Node/procps native prerequisites | REA as separate MCP server; pinned version before activation | SDK vetting, Ward, Benchmark | `rea --help` and harmless local JS artifact analysis; no blind binary mutation |
| cdlewis/nigel | Candidate loops, verify command, optional agent CLI and shard | Zed Task/terminal; do NOT expose unrestricted runner as autoapproved MCP write | SDK, @ibal, Ward | One no-effect candidate/dry-run; verify and reset only inside isolated disposable worktree |
| rehan-remade/universal-modder | Game-specific recon, build, generated assets, in-game tests; optional external fal.ai effects | Import selected skill only into a sandboxed external agent | Ward, SDK, Bins | Exact-owned test game; do not run downloads/publishing/paid asset calls without separate gate |
| storytold/photocraft | Rust local editor, offline GPU/CPU compositors, PSD tests, CLI/build | Open project in Zed, use cargo tests; eventual Studio/Sable adapter | Publisher, Sable, SDK | Pin corpus, `cargo test --workspace`, independent PSD readback |

These are **hostile test sources**, not five certified tools. Neither GitHub source nor local clone is runtime proof. REA's normal setup supports several external agents, but use documented manual MCP registration for Zed; do not assume its setup modifies Zed automatically.

## Live acceptance before promotions

1. Zed shows `xiio-inbox` MCP active, `tools/list` includes all three.
2. `xiio_inbox_health` reaches **installed** Inbox CRM :8794. Source-only tests do not count.
3. One internal message is delivered/consumed by an actual assigned worker. A persisted `sim_mail` event is not transport.
4. Exactly one qualified worker Result reaches Inbox/Bins; 5.5 opposing readback checks evidence, then `APPLY_RETURN` once and REAP.
5. Ward admits physical writes at real builder sink with pre/post SHA-256 and readback. Only then unlock 3s/4s affected gates.

**Current truth at authoring:** source candidate; local Zed/Aries offline; no external agent quorum or live provider effects verified. Do not install plugin or alter workstation configuration automatically from GitHub.
