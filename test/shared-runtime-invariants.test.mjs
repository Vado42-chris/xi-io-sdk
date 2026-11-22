import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readRuntimeVariables, assertLoopbackBind, assertTrustedOwnership, assertGeneration, SharedInvariantError,
} from '../src/runtime/shared-invariants.mjs';

const full = {
  XIIO_WARD_HTTP_DECISION_DB: '/var/lib/xi-io/ward/decisions.sqlite',
  XIIO_CONNECTED_NATIVE_HOST_URL: 'http://127.0.0.1:5201/',
  XIIO_INSTALLER_IDENTITY_RECORD: '/etc/xi-io/installer-identity.json',
};
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('missing required variables return WAIT and never a guessed value', () => {
  const r = readRuntimeVariables({});
  assert.equal(r.state, 'WAIT');
  assert.deepEqual(r.missing.sort(), ['XIIO_CONNECTED_NATIVE_HOST_URL', 'XIIO_INSTALLER_IDENTITY_RECORD', 'XIIO_WARD_HTTP_DECISION_DB']);
});

test('complete variables are READY with the declared port default', () => {
  const r = readRuntimeVariables(full);
  assert.equal(r.state, 'READY');
  assert.equal(r.values.WARD_PACKET_ADMISSION_PORT, 18790);
});

test('relative DB path, non-loopback native URL, bad port and relative record path are refused', () => {
  assert.equal(code(() => readRuntimeVariables({ ...full, XIIO_WARD_HTTP_DECISION_DB: 'decisions.sqlite' })), 'INVARIANT_DB_PATH_NOT_ABSOLUTE');
  assert.equal(code(() => readRuntimeVariables({ ...full, XIIO_CONNECTED_NATIVE_HOST_URL: 'http://10.0.0.5:5201/' })), 'INVARIANT_NATIVE_URL_NOT_LOOPBACK');
  assert.equal(code(() => readRuntimeVariables({ ...full, XIIO_CONNECTED_NATIVE_HOST_URL: 'https://127.0.0.1:5201/' })), 'INVARIANT_NATIVE_URL_NOT_LOOPBACK');
  assert.equal(code(() => readRuntimeVariables({ ...full, XIIO_WARD_PACKET_ADMISSION_PORT: '80' })), 'INVARIANT_PORT_INVALID');
  assert.equal(code(() => readRuntimeVariables({ ...full, XIIO_INSTALLER_IDENTITY_RECORD: 'identity.json' })), 'INVARIANT_RECORD_PATH_NOT_ABSOLUTE');
});

test('bind must be loopback', () => {
  assert.equal(assertLoopbackBind('127.0.0.1'), true);
  assert.equal(code(() => assertLoopbackBind('0.0.0.0')), 'INVARIANT_NON_LOOPBACK_BIND');
});

test('ownership: other UID and group/world write are refused', () => {
  assert.equal(assertTrustedOwnership({ uid: 0, mode: 0o100644 }, 0), true);
  assert.equal(code(() => assertTrustedOwnership({ uid: 1000, mode: 0o100644 }, 0)), 'INVARIANT_OWNER_UNTRUSTED');
  assert.equal(code(() => assertTrustedOwnership({ uid: 0, mode: 0o100666 }, 0)), 'INVARIANT_WRITABLE_BY_OTHERS');
});

test('generation must be a full SHA-1 or SHA-256 and must match exactly', () => {
  const g = 'a'.repeat(40);
  assert.equal(assertGeneration(g, g), true);
  assert.equal(code(() => assertGeneration(g, 'b'.repeat(40))), 'INVARIANT_GENERATION_MISMATCH');
  assert.equal(code(() => assertGeneration('main', 'main')), 'INVARIANT_GENERATION_INVALID');
});
