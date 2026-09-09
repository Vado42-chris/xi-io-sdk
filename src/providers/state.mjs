const AUTH_STATES = new Set(['AUTHENTICATED', 'UNAUTHENTICATED', 'UNKNOWN']);

function toInt(value) {
  if (Number.isInteger(value)) return value;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRetryAfterMs(headers = {}) {
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (raw == null) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const when = Date.parse(String(raw));
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

function normalizeToken(value) {
  return String(value ?? '').trim().toUpperCase();
}

function classify({ httpStatus, providerStatus, providerReason, failureKind }) {
  if (failureKind === 'NETWORK_UNREACHABLE') return 'PROVIDER_NETWORK_UNREACHABLE';
  if (httpStatus === 429 && providerStatus === 'RESOURCE_EXHAUSTED') return 'PROVIDER_CAPACITY_EXHAUSTED';
  if (httpStatus === 429) return 'PROVIDER_RATE_LIMITED';
  if (httpStatus === 401) return 'PROVIDER_AUTH_REQUIRED';
  if (httpStatus === 403) return 'PROVIDER_PERMISSION_DENIED';
  if (providerStatus.includes('MODEL') && providerStatus.includes('UNAVAILABLE')) return 'PROVIDER_MODEL_UNAVAILABLE';
  if (providerReason === 'MODEL_UNAVAILABLE') return 'PROVIDER_MODEL_UNAVAILABLE';
  if (providerReason === 'OPERATION_UNSUPPORTED') return 'PROVIDER_OPERATION_UNSUPPORTED';
  if (httpStatus != null && httpStatus >= 500) return 'PROVIDER_SERVER_ERROR';
  if (httpStatus === 400) return 'PROVIDER_BAD_REQUEST';
  return 'PROVIDER_UNKNOWN_FAILURE';
}

function operationState(failureClass) {
  switch (failureClass) {
    case 'PROVIDER_CAPACITY_EXHAUSTED':
    case 'PROVIDER_RATE_LIMITED': return 'WAIT_PROVIDER_CAPACITY';
    case 'PROVIDER_AUTH_REQUIRED': return 'WAIT_PROVIDER_AUTH';
    case 'PROVIDER_PERMISSION_DENIED': return 'BLOCKED_PROVIDER_PERMISSION';
    case 'PROVIDER_MODEL_UNAVAILABLE': return 'WAIT_PROVIDER_MODEL';
    case 'PROVIDER_OPERATION_UNSUPPORTED': return 'BLOCKED_PROVIDER_UNSUPPORTED';
    case 'PROVIDER_NETWORK_UNREACHABLE':
    case 'PROVIDER_SERVER_ERROR': return 'WAIT_PROVIDER_RECOVERY';
    case 'PROVIDER_BAD_REQUEST': return 'BLOCKED_REQUEST_CORRECTION';
    default: return 'UNKNOWN';
  }
}

function humanSummary(provider, failureClass) {
  switch (failureClass) {
    case 'PROVIDER_CAPACITY_EXHAUSTED': return `${provider} is reachable, but this operation is unavailable because provider capacity or quota is exhausted.`;
    case 'PROVIDER_RATE_LIMITED': return `${provider} is reachable, but this operation is currently rate limited.`;
    case 'PROVIDER_AUTH_REQUIRED': return `${provider} rejected or requires authentication for this operation.`;
    case 'PROVIDER_PERMISSION_DENIED': return `${provider} denied this operation under the current permissions.`;
    case 'PROVIDER_MODEL_UNAVAILABLE': return `${provider} cannot currently provide the selected model.`;
    case 'PROVIDER_OPERATION_UNSUPPORTED': return `${provider} does not support this operation on the selected surface.`;
    case 'PROVIDER_NETWORK_UNREACHABLE': return `${provider} could not be reached.`;
    case 'PROVIDER_SERVER_ERROR': return `${provider} returned a server-side failure.`;
    case 'PROVIDER_BAD_REQUEST': return `${provider} rejected the request as invalid.`;
    default: return `${provider} returned an unclassified provider failure.`;
  }
}

export function normalizeProviderFailure(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('provider failure input must be an object');

  const provider = String(input.provider ?? '').trim() || 'Provider';
  const httpStatus = toInt(input.http_status);
  const providerStatus = normalizeToken(input.provider_status ?? input.error_status);
  const providerReason = normalizeToken(input.provider_reason ?? input.error_reason);
  const failureKind = normalizeToken(input.failure_kind);
  const providerReached = input.provider_reached === true || httpStatus != null;
  const explicitAuth = normalizeToken(input.auth_state);
  const authState = AUTH_STATES.has(explicitAuth) ? explicitAuth : httpStatus === 401 ? 'UNAUTHENTICATED' : 'UNKNOWN';
  const retryAfterMs = input.retry_after_ms != null ? toInt(input.retry_after_ms) : parseRetryAfterMs(input.headers);
  const quotaResetAt = typeof input.quota_reset_at === 'string' && input.quota_reset_at.trim() ? input.quota_reset_at.trim() : null;
  const failureClass = classify({ httpStatus, providerStatus, providerReason, failureKind });
  const traceId = typeof input.provider_trace_id === 'string' && input.provider_trace_id.trim() ? input.provider_trace_id.trim() : null;

  return {
    schema: 'xiio.sdk.provider-operation-state/v1',
    provider,
    operation: String(input.operation ?? '').trim() || 'unknown',
    provider_reached: providerReached,
    http_status: httpStatus,
    provider_status: providerStatus || null,
    provider_reason: providerReason || null,
    auth_state: authState,
    failure_class: failureClass,
    operation_state: operationState(failureClass),
    retry_after_ms: Number.isInteger(retryAfterMs) && retryAfterMs >= 0 ? retryAfterMs : null,
    quota_reset_at: quotaResetAt,
    retry_timing_state: (Number.isInteger(retryAfterMs) && retryAfterMs >= 0) || quotaResetAt ? 'EVIDENCED' : 'UNKNOWN',
    automatic_retry_authorized: false,
    fallback_authorized: false,
    provider_trace_ref: traceId ? `provider-trace:${traceId}` : null,
    source_failure_credit: false,
    work_invalidated: false,
    raw_provider_payload_included: false,
    human_summary: humanSummary(provider, failureClass),
    next_action_class: operationState(failureClass),
  };
}
