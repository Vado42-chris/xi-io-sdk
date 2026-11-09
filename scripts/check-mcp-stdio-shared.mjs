#!/usr/bin/env node
// Guard: every SDK MCP stdio facade consumes the one shared receiver.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireLoopbackUrl, createToolServer } from '../src/mcp/stdio-tool-server.mjs';

for (const f of ['bin/xi-zed-mcp.mjs', 'bin/xi-zed-mcp-products.mjs']) {
  const s = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(s, /src\/mcp\/stdio-tool-server\.mjs/, `${f} must import the shared MCP receiver`);
  assert.doesNotMatch(s, /node:readline|jsonrpc/, `${f} must not re-implement the JSON-RPC loop`);
}
assert.equal(requireLoopbackUrl('http://127.0.0.1:8794').origin, 'http://127.0.0.1:8794');
for (const bad of ['https://127.0.0.1:1', 'http://example.com', 'http://u:p@127.0.0.1:1', 'http://127.0.0.1:1/x', 'http://localhost:1'])
  assert.throws(() => requireLoopbackUrl(bad), /HOST_NOT_LOOPBACK/, bad);
assert.equal(requireLoopbackUrl('http://[::1]:8870/estate/v1?x=1', { allowPath: true }).path, '/estate/v1?x=1');
assert.throws(() => requireLoopbackUrl('http://127.0.0.1:1/a#frag', { allowPath: true }), /HOST_NOT_LOOPBACK/);

const out = [];
const { receive } = createToolServer({ name: 't', declarations: [{ name: 'x' }], call: async () => ({ ok: 1 }), write: (s) => out.push(JSON.parse(s)) });
await receive('not json'); await receive('{"jsonrpc":"2.0","method":"ping"}');
await receive('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"x","arguments":[]}}');
await receive('{"jsonrpc":"2.0","id":2,"method":"nope"}');
await receive('{"jsonrpc":"2.0","id":3,"method":"tools/list"}');
assert.deepEqual(out.map((m) => m.error?.code ?? 'ok'), [-32700, -32602, -32601, 'ok']);
console.log('mcp-stdio-shared: PASS (2 facades on one receiver, loopback + JSON-RPC hostiles)');
