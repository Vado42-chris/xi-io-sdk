# Local-agent receiver continuity

The accepted Compass diagnostic repair does not automatically update the separate
SDK local-agent execution consumer. The local-agent `/api/tags` and `/api/chat`
requests must not follow redirects to another receiver. Both requests now set
`redirect: error`, retaining existing unreachable/blocked dispositions.

The existing raw runtime denominator executes `test/local-agent-receiver.test.mjs`.
It uses two disposable HTTP servers and the actual one-shot executable. The test
refuses an occupied fixed local-model port rather than contacting an existing
installation. Five redirect statuses fail before repair and pass afterward;
direct 200 and 503 controls pass both before and after. A refused redirect creates
no conversation session and sends no request to the replacement receiver.

This is receiver continuity, not model identity authentication, Ward admission,
BINS custody, or consumed-return proof. The existing fixed local-model endpoint
is unchanged: deployment/catalog convergence remains a separate consumption gap.
The SDK local-agent service and one-shot consumers are affected. Other product
adoption is UNKNOWN until exact consumer bindings are established.
