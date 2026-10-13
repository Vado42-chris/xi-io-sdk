/* ── THE LOCAL AGENT'S DOOR · xiio.cli.local-agent-http/v1 ─────────────────────
 *
 * A theme or Studio page talks to the local agent through this door, never to
 * Ollama. The page is served from the same address, so the browser treats the
 * two as one origin and no OLLAMA_ORIGINS / CORS setting is ever needed.
 *
 * What keeps other websites out:
 *   - the socket binds 127.0.0.1 only;
 *   - the Host header must name that loopback address and port (DNS rebinding);
 *   - an Origin header, when present, must be this door's own origin;
 *   - a turn must be application/json, so a cross-site browser request needs a
 *     preflight, and preflights are refused without CORS headers;
 *   - one turn at a time, bounded body, bounded time: a turn past
 *     TURN_TIMEOUT_MS is answered 504 and aborted, and a request that takes
 *     longer than REQUEST_TIMEOUT_MS to arrive is dropped.
 *
 * The door grants nothing. Every turn still runs through the agent's own chat
 * loop, its realization gate, and its --execute ceiling.
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_AGENT_HTTP_SCHEMA = 'xiio.cli.local-agent-http/v1';
export const MAX_TURN_BYTES = 65_536;
/* How long one turn may take before the page is told so. A local model on a
   small machine can be slow; two minutes is long enough for a real answer and
   short enough that a page never waits forever on a stuck one. */
export const TURN_TIMEOUT_MS = 120_000;
/* How long a request may take to arrive at all (headers and body). */
export const REQUEST_TIMEOUT_MS = 30_000;
const LOOPBACK = '127.0.0.1';
const TIMED_OUT = Symbol('TIMED_OUT');
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
});

/**
 * Native install receipt: sdk.path root must contain the HTTP door, and the
 * running process must be that root's xi-local-agent.mjs (not a stale tree).
 * Hard: OLLAMA_READY != INSTALLED_GENERATION_VERIFIED
 */
export function readInstalledSdkGeneration({
  home = os.homedir(),
  argv1 = process.argv[1] || '',
  doorModuleUrl = import.meta.url,
} = {}) {
  const pathFile = path.join(home, '.local', 'share', 'xi-io', 'cli', 'sdk.path');
  let configured = '';
  try {
    configured = fs.readFileSync(pathFile, 'utf8').trim().replace(/\r/g, '');
  } catch {
    return { ok: false, first_red: 'SDK_PATH_MISSING', path_file: pathFile };
  }
  if (!configured) return { ok: false, first_red: 'SDK_PATH_EMPTY', path_file: pathFile };
  const sdkRoot = path.resolve(configured);
  const door = path.join(sdkRoot, 'src', 'cli', 'local-agent-http.mjs');
  const agent = path.join(sdkRoot, 'bin', 'xi-local-agent.mjs');
  if (!fs.existsSync(door) || !fs.existsSync(agent)) {
    return { ok: false, first_red: 'INSTALLED_SDK_NO_HTTP_DOOR', sdk_root: sdkRoot };
  }
  let argvResolved = '';
  try { argvResolved = argv1 ? fs.realpathSync(path.resolve(argv1)) : ''; } catch { argvResolved = argv1 ? path.resolve(argv1) : ''; }
  let agentResolved = '';
  try { agentResolved = fs.realpathSync(agent); } catch { agentResolved = agent; }
  const fromInstalledAgent = argvResolved === agentResolved;
  if (!fromInstalledAgent) {
    return {
      ok: false,
      first_red: 'PROCESS_NOT_FROM_INSTALLED_SDK',
      sdk_root: sdkRoot,
      argv1: argvResolved,
      expected_agent: agentResolved,
    };
  }
  let loadedDoor = '';
  let installedDoor = '';
  try {
    loadedDoor = fs.realpathSync(fileURLToPath(doorModuleUrl));
    installedDoor = fs.realpathSync(door);
  } catch {
    return { ok: false, first_red: 'DOOR_MODULE_NOT_FROM_INSTALLED_SDK', sdk_root: sdkRoot };
  }
  if (loadedDoor !== installedDoor) {
    return { ok: false, first_red: 'DOOR_MODULE_NOT_FROM_INSTALLED_SDK', sdk_root: sdkRoot, loadedDoor, installedDoor };
  }
  return { ok: true, first_red: null, sdk_root: sdkRoot, agent: agentResolved };
}

/** Decide whether a request may reach the agent. Pure, so it is tested alone. */
export function admitLocalRequest({ method = '', url = '/', headers = {} } = {}, { port } = {}) {
  const host = String(headers.host || '');
  const allowedHosts = new Set([`${LOOPBACK}:${port}`, `localhost:${port}`]);
  if (!allowedHosts.has(host)) return { ok: false, status: 403, reason: 'HOST_NOT_LOOPBACK' };
  const origin = headers.origin;
  if (origin !== undefined && origin !== `http://${LOOPBACK}:${port}` && origin !== `http://localhost:${port}`) {
    return { ok: false, status: 403, reason: 'FOREIGN_ORIGIN' };
  }
  if (method === 'OPTIONS') return { ok: false, status: 403, reason: 'PREFLIGHT_REFUSED' };
  const pathname = String(url).split('?')[0];
  if (method === 'POST' && pathname === '/v1/turn') {
    const type = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return { ok: false, status: 415, reason: 'JSON_REQUIRED' };
    const length = Number(headers['content-length'] || 0);
    if (length > MAX_TURN_BYTES) return { ok: false, status: 413, reason: 'TURN_TOO_LARGE' };
    return { ok: true, route: 'turn' };
  }
  if (method === 'GET' && pathname === '/v1/status') return { ok: true, route: 'status' };
  if (method === 'GET') return { ok: true, route: 'ui', pathname };
  return { ok: false, status: 405, reason: 'METHOD_NOT_ALLOWED' };
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_TURN_BYTES) throw Object.assign(new Error('TURN_TOO_LARGE'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveUi(res, uiDir, pathname) {
  if (!uiDir) return send(res, 404, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'NO_UI', first_red: 'start with --ui <dir> to serve a theme' });
  const root = path.resolve(uiDir);
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.resolve(root, '.' + rel);
  if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, { state: 'PATH_DENIED' });
  try {
    const data = await fsp.readFile(file);
    return send(res, 200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch {
    return send(res, 404, { state: 'NOT_FOUND' });
  }
}

/**
 * Start the door. `handleTurn(message, { signal })` runs one agent turn and
 * resolves to the reply text; `status()` resolves to the agent's runtime status.
 *
 * A turn that outlives `turnTimeoutMs` is answered 504 TURN_TIMEOUT at once and
 * its `signal` is aborted. The door stays BUSY until that turn actually stops:
 * a timed-out turn may still be talking to the model, and starting a second
 * one beside it would be two turns at once, which this door never allows.
 */
export function startLocalAgentServer({ port = 3109, handleTurn, status, uiDir = null, turnTimeoutMs = TURN_TIMEOUT_MS, requestTimeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (typeof handleTurn !== 'function' || typeof status !== 'function') throw new Error('LOCAL_AGENT_HANDLERS_REQUIRED');
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const bound = server.address()?.port ?? port;
    const admission = admitLocalRequest(req, { port: bound });
    if (!admission.ok) return send(res, admission.status, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'REFUSED', reason: admission.reason });
    try {
      if (admission.route === 'status') {
        const observed = await status();
        const modelReady = observed?.ollama_state === 'READY_MODEL_PRESENT';
        const generation = readInstalledSdkGeneration();
        const installedOk = generation.ok === true;
        const runtimeOk = modelReady && installedOk;
        const firstRed = !installedOk
          ? generation.first_red
          : (modelReady ? null : 'OLLAMA_MODEL_NOT_READY');
        return send(res, 200, {
          ...observed,
          schema: LOCAL_AGENT_HTTP_SCHEMA,
          state: runtimeOk ? 'READY' : 'DEGRADED',
          busy,
          service_listener_observed: true,
          service_process_pid: process.pid,
          ollama_model_ready: modelReady,
          installed_sdk_generation_verified: installedOk,
          installed_sdk_root: generation.sdk_root || null,
          runtime_verified: runtimeOk,
          native_receipt_state: installedOk
            ? (modelReady ? 'INSTALLED_GENERATION_AND_RUNTIME_OK' : 'INSTALLED_GENERATION_OK_MODEL_NOT_READY')
            : 'INSTALLED_GENERATION_READBACK_REQUIRED',
          first_red: firstRed,
          conversation_context_supported: true,
        });
      }
      if (admission.route === 'ui') return serveUi(res, uiDir, admission.pathname);
      if (busy) return send(res, 409, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'BUSY', reason: 'ONE_TURN_AT_A_TIME' });
      const raw = await readBody(req);
      let message, body;
      try { body = JSON.parse(raw); message = String(body?.message ?? '').trim(); } catch { message = ''; }
      if (!message) return send(res, 400, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'REFUSED', reason: 'MESSAGE_REQUIRED' });
      const conversationRef = body.conversation_ref;
      if (conversationRef !== undefined && (typeof conversationRef !== 'string' || !/^[A-Za-z0-9:_.-]{1,256}$/.test(conversationRef))) {
        return send(res, 400, { state: 'REFUSED', reason: 'CONVERSATION_REF_INVALID' });
      }
      const context = body.context ?? [];
      if ((body.context !== undefined && conversationRef === undefined) || !Array.isArray(context) || context.length > 40
          || context.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 16000)) {
        return send(res, 400, { state: 'REFUSED', reason: 'CONVERSATION_CONTEXT_INVALID' });
      }
      busy = true;
      const controller = new AbortController();
      const turn = Promise.resolve()
        .then(() => handleTurn(message, { signal: controller.signal, conversationRef, context }))
        .finally(() => { busy = false; });
      let timer;
      const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), turnTimeoutMs); });
      try {
        const reply = await Promise.race([turn, timedOut]);
        if (reply === TIMED_OUT) {
          controller.abort(new Error('TURN_TIMEOUT'));
          turn.catch(() => {});
          return send(res, 504, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'BLOCKED', reason: 'TURN_TIMEOUT', timeout_ms: turnTimeoutMs, provider_effect: false });
        }
        return send(res, 200, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'ANSWERED', reply, provider_effect: false });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      return send(res, error?.status || 500, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'BLOCKED', first_red: String(error?.message || error) });
    }
  });
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.min(requestTimeoutMs, 20_000);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => resolve(server));
  });
}
