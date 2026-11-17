# Local-agent receiver continuity

The accepted Compass diagnostic repair does not automatically update the separate
SDK local-agent execution consumer. The local-agent `/api/tags` and `/api/chat`
requests must not follow redirects to another receiver. Both requests now set
`redirect: error`, retaining existing unreachable/blocked dispositions.

The existing raw runtime denominator executes `test/local-agent-receiver.test.mjs`.
It uses two disposable HTTP servers on ephemeral ports and the actual one-shot executable.
Both discovery and chat must consume the explicit existing OLLAMA_HOST setting;
no test needs an installed model server or the conventional model port. Five redirect statuses fail before repair and pass afterward;
direct 200 and 503 controls pass both before and after. A refused redirect creates
no conversation session and sends no request to the replacement receiver.

This is receiver continuity, not model identity authentication, Ward admission,
BINS custody, or consumed-return proof. The local-agent now consumes the existing OLLAMA_HOST setting through the existing
SDK requireLoopbackUrl validator. Absent setting preserves the historical default;
invalid explicit setting refuses rather than falling back. Only literal-IP HTTP
loopback origins are accepted, never credentials, paths, queries or fragments.
The normalized origin is captured once and invalid raw settings are not echoed.
CLI ai_engines-to-environment composition remains separate consumption debt.
This does not authorize remote model access or change the service listener.
The SDK local-agent service and one-shot consumers are affected. Other product
adoption is UNKNOWN until exact consumer bindings are established.

Deployment-consumer regression: before this binding repair, all seven explicit
non-default-port scenarios failed to reach the configured receiver. After repair,
seven receiver-continuity scenarios, nine invalid explicit settings, and one
absent-setting compatibility control pass (17/17). The invalid cases include
credential-bearing URLs and verify that status/output does not echo those values.
Existing `check-mcp-stdio-shared` controls retain IPv6 literal acceptance and the
same strict URL policy. This is not proof of a live IPv6 or authorized remote host.

## Installer status readback consumer

The install command also consumes this boundary. Its status subprocess now takes
its URL from the existing compiled service specification and refuses redirects.
Previously a replacement HTTP receiver could supply the expected status fields
and cause `ACTIVE_STATUS_VERIFIED` for the original endpoint.

The existing service qualification now includes the actual install command in a
disposable HOME, with a clearly synthetic systemctl process and real HTTP servers.
Five redirect cases refused plus direct 200/503 controls pass (2/7 before, 7/7 after).
No live systemd service is started, stopped or configured by this test. An occupied
3109 port refuses the test. Service activation is a fixture, not installation proof.
`status_readback` still means status observation only: runtime/generation booleans
remain separate, and this repair grants no installed identity or Ward authority.
