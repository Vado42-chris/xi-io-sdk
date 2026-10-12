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
 *   - one turn at a time, bounded body, bounded time.
 *
 * The door grants nothing. Every turn still runs through the agent's own chat
 * loop, its realization gate, and its --execute ceiling.
 */

import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const LOCAL_AGENT_HTTP_SCHEMA = 'xiio.cli.local-agent-http/v1';
export const MAX_TURN_BYTES = 65_536;
const LOOPBACK = '127.0.0.1';
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
});

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
 * Start the door. `handleTurn(message)` runs one agent turn and resolves to the
 * reply text; `status()` resolves to the agent's runtime status.
 */
export function startLocalAgentServer({ port = 3109, handleTurn, status, uiDir = null } = {}) {
  if (typeof handleTurn !== 'function' || typeof status !== 'function') throw new Error('LOCAL_AGENT_HANDLERS_REQUIRED');
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const bound = server.address()?.port ?? port;
    const admission = admitLocalRequest(req, { port: bound });
    if (!admission.ok) return send(res, admission.status, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'REFUSED', reason: admission.reason });
    try {
      if (admission.route === 'status') { const observed = await status(); const modelReady = observed?.ollama_state === 'READY_MODEL_PRESENT'; return send(res, 200, { ...observed, schema: LOCAL_AGENT_HTTP_SCHEMA, state: modelReady ? 'READY' : 'DEGRADED', busy, runtime_verified: modelReady, first_red: modelReady ? null : 'OLLAMA_MODEL_NOT_READY' }); }
      if (admission.route === 'ui') return serveUi(res, uiDir, admission.pathname);
      if (busy) return send(res, 409, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'BUSY', reason: 'ONE_TURN_AT_A_TIME' });
      const raw = await readBody(req);
      let message;
      try { message = String(JSON.parse(raw)?.message ?? '').trim(); } catch { message = ''; }
      if (!message) return send(res, 400, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'REFUSED', reason: 'MESSAGE_REQUIRED' });
      busy = true;
      try {
        const reply = await handleTurn(message);
        return send(res, 200, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'ANSWERED', reply, provider_effect: false });
      } finally {
        busy = false;
      }
    } catch (error) {
      return send(res, error?.status || 500, { schema: LOCAL_AGENT_HTTP_SCHEMA, state: 'BLOCKED', first_red: String(error?.message || error) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => resolve(server));
  });
}
