// Shared runtime variables and invariants for xi-io consumers.
// LIVING DOCUMENT: this list changes as consumers qualify. Version: v1 (2026-11-22).
// Owners: variables are declared here once; consumers import them rather than re-declaring.
// Rule: a missing required variable returns WAIT, never a default that changes a trust decision.

export const SHARED_RUNTIME_VARIABLES = Object.freeze({
  WARD_PACKET_ADMISSION_PORT: Object.freeze({ env: 'XIIO_WARD_PACKET_ADMISSION_PORT', required: false, default: 18790 }),
  WARD_DECISION_DB:           Object.freeze({ env: 'XIIO_WARD_HTTP_DECISION_DB', required: true }),
  NATIVE_HOST_URL:            Object.freeze({ env: 'XIIO_CONNECTED_NATIVE_HOST_URL', required: true }),
  INSTALLER_IDENTITY_RECORD:  Object.freeze({ env: 'XIIO_INSTALLER_IDENTITY_RECORD', required: true }),
});

export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const GENERATION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class SharedInvariantError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Returns { state: 'READY', values } or { state: 'WAIT', missing }. Never guesses a value.
export function readRuntimeVariables(env = process.env) {
  const values = {};
  const missing = [];
  for (const [name, spec] of Object.entries(SHARED_RUNTIME_VARIABLES)) {
    const raw = env[spec.env];
    if (raw === undefined || String(raw).trim() === '') {
      if (spec.required) missing.push(spec.env);
      else values[name] = spec.default;
      continue;
    }
    values[name] = String(raw).trim();
  }
  if (missing.length) return { state: 'WAIT', missing };
  const port = Number(values.WARD_PACKET_ADMISSION_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new SharedInvariantError('INVARIANT_PORT_INVALID');
  values.WARD_PACKET_ADMISSION_PORT = port;
  if (!values.WARD_DECISION_DB.startsWith('/')) throw new SharedInvariantError('INVARIANT_DB_PATH_NOT_ABSOLUTE');
  let url;
  try { url = new URL(values.NATIVE_HOST_URL); } catch { throw new SharedInvariantError('INVARIANT_NATIVE_URL_INVALID'); }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw new SharedInvariantError('INVARIANT_NATIVE_URL_NOT_LOOPBACK');
  }
  if (!values.INSTALLER_IDENTITY_RECORD.startsWith('/')) throw new SharedInvariantError('INVARIANT_RECORD_PATH_NOT_ABSOLUTE');
  return { state: 'READY', values };
}

export function assertLoopbackBind(host) {
  if (!LOOPBACK_HOSTS.includes(host)) throw new SharedInvariantError('INVARIANT_NON_LOOPBACK_BIND');
  return true;
}

// Owner and mode check for anything the worker identity must not write.
export function assertTrustedOwnership(stat, trustedUid) {
  if (stat.uid !== trustedUid) throw new SharedInvariantError('INVARIANT_OWNER_UNTRUSTED');
  if ((stat.mode & 0o022) !== 0) throw new SharedInvariantError('INVARIANT_WRITABLE_BY_OTHERS');
  return true;
}

export function assertGeneration(expected, actual) {
  if (!GENERATION.test(String(expected)) || !GENERATION.test(String(actual))) throw new SharedInvariantError('INVARIANT_GENERATION_INVALID');
  if (expected !== actual) throw new SharedInvariantError('INVARIANT_GENERATION_MISMATCH');
  return true;
}
