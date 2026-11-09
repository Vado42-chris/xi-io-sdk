// Shared XI-IO MCP stdio tool server (JSON-RPC 2.0, newline-delimited).
// One receiver for every SDK MCP facade (Inbox, Desktop/Articles/Publisher, ...).
// Effect ceiling is set by each facade's tools; this module grants no authority.
import { createInterface } from 'node:readline';

export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', '[::1]']);

// Accept only plain-http loopback URLs with no credentials.
// allowPath=false also refuses any path, query or fragment (origin only).
export function requireLoopbackUrl(raw, { allowPath = false } = {}) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(url.hostname) || url.username || url.password)
    throw new Error('HOST_NOT_LOOPBACK');
  if (!allowPath && (url.pathname !== '/' || url.search || url.hash)) throw new Error('HOST_NOT_LOOPBACK');
  if (url.hash) throw new Error('HOST_NOT_LOOPBACK');
  return { origin: url.origin, path: `${url.pathname}${url.search}` || '/' };
}

export const rpcError = (code, message) => ({ code, message });
export const toolText = (x) => ({ content: [{ type: 'text', text: JSON.stringify(x) }], isError: false });
export const toolFailed = (code, detail) => ({
  content: [{ type: 'text', text: JSON.stringify({ ok: false, code, detail, effect_performed: false }) }],
  isError: true,
});

export function createToolServer({ name, version = '0.1.0', declarations, call, write = (s) => process.stdout.write(s) }) {
  const send = (message) => write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  async function receive(line) {
    let request;
    try { request = JSON.parse(line); } catch { send({ id: null, error: rpcError(-32700, 'Parse error') }); return; }
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      send({ id: request?.id ?? null, error: rpcError(-32600, 'Invalid Request') }); return;
    }
    if (request.id === undefined) return; // Notifications are unidirectional.
    const { id, method, params = {} } = request;
    try {
      if (method === 'initialize') {
        send({ id, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name, version } } });
        return;
      }
      if (method === 'ping') { send({ id, result: {} }); return; }
      if (method === 'tools/list') { send({ id, result: { tools: declarations } }); return; }
      if (method === 'tools/call') {
        const a = params?.arguments;
        if (!params || typeof params.name !== 'string' || (a !== undefined && (typeof a !== 'object' || a === null || Array.isArray(a)))) {
          send({ id, error: rpcError(-32602, 'Invalid params') }); return;
        }
        send({ id, result: await call(params.name, a ?? {}) });
        return;
      }
      send({ id, error: rpcError(-32601, 'Method not found') });
    } catch (e) {
      send({ id, result: toolFailed(e.code || 'INTERNAL_FAILURE', e.message || 'Unknown failure') });
    }
  }
  return { receive };
}

export async function runStdioToolServer(options) {
  const { receive } = createToolServer(options);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) await receive(line);
}
