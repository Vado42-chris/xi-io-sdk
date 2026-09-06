# xi-io SDK

Public component and primitive source for xi-io.

This repository owns the public reusable component implementations, primitive contracts, callable UUID anchors, and playground surface.

The proprietary xi-io management machinery is not mirrored here. Currentness, qualification, promotion, adoption, retirement, security policy, orchestration, evidence, and effect admission remain behind the protected framework/Ward boundary.

A callable UUID is a public discovery and invocation anchor only. It is not canonical identity, truth, authority, qualification, provenance, or provider-effect evidence. Catalog entries are the SSOT for these anchors; `callable_namespace_uuid` is documentation-only on this tip and does not mint matching handles.

HTML composition slots such as `bodyHtml` / `iconHtml` are caller-trusted input, not a sanitizer.

## Provider operation state

`@xi-io/sdk/providers` exposes `normalizeProviderFailure(...)`, a provider-neutral public projection for external AI/provider failures. It turns provider evidence such as HTTP status, provider status/reason, optional retry/reset hints, and optional trace IDs into a bounded `xiio.sdk.provider-operation-state/v1` result.

It deliberately does **not** own retry scheduling, fallback authority, credentials, provider qualification, work invalidation, or source failure. For example, `HTTP 429 + RESOURCE_EXHAUSTED` becomes `PROVIDER_CAPACITY_EXHAUSTED / WAIT_PROVIDER_CAPACITY`; authentication remains `UNKNOWN` unless separately evidenced, and missing retry timing remains `UNKNOWN`.

```js
import { normalizeProviderFailure } from '@xi-io/sdk/providers';

const state = normalizeProviderFailure({
  provider: 'Example Provider',
  operation: 'agent_execution',
  http_status: 429,
  provider_status: 'RESOURCE_EXHAUSTED',
});
```

The SDK is the car. The protected framework is the gas and management system.
