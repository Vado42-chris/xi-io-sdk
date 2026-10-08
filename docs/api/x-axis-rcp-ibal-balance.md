# X-axis RCP and @ibal balance API

These functions are provider-agnostic SDK operations. The CLI is the local human/AI front door; HTTP/WebSocket adapters should call the same functions rather than reimplement their logic.

## Operations

### POST /v1/x/scan
Input: `{"root":"<server-admitted-workspace-ref>"}`
Output: `xiio.xaxis.local-scan/v1`.

### POST /v1/x/rcp
Input: admitted workspace reference. Server resolves the workspace, runs the same scan, then `earnRcp`.
Output: `xiio.xaxis.rcp/v1`.

### POST /v1/ibal/balance
Input: `{"left":12,"right":10,"unknown":3}`
Output: `xiio.ibal.balance/v1`.

## WebSocket / AI-Mail

Publish the same typed results over the existing Switchboard/AI-Mail channel with correlation/work UUIDs. Do not create a second state model for sockets.

## Security boundary

The public API must never accept an arbitrary host filesystem path from an untrusted remote caller. Resolve an admitted workspace/custody reference server-side. RCP is evidence only and grants no effect authority.
