import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/xi-zed-mcp-products.mjs', import.meta.url));

const server = http.createServer((req, res) => {
  if (req.url === '/desktop-ok') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('desktop');
    return;
  }
  if (req.url === '/articles-ok') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ schema: 'mock.articles', ok: true }));
    return;
  }
  if (req.url === '/publisher-ok') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ schema: 'mock.publisher', ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, [bin], {
  env: {
    ...process.env,
    XIIO_DESKTOP_LOOPBACK_URL: `${base}/desktop-ok`,
    XIIO_ARTICLES_LOOPBACK_URL: `${base}/articles-ok`,
    XIIO_PUBLISHER_LOOPBACK_URL: `${base}/publisher-ok`,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let next = 0;
const pending = new Map();
createInterface({ input: child.stdout }).on('line', (line) => {
  const msg = JSON.parse(line);
  const p = pending.get(msg.id);
  if (p) {
    pending.delete(msg.id);
    p(msg);
  }
});

const rpc = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error('MCP timeout ' + method));
    }, 3000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

let checks = 0;
const check = (x) => {
  assert.ok(x);
  checks += 1;
};

try {
  const init = await rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'hostile', version: '1' },
  });
  check(init.result.serverInfo.name === 'xiio-products-zed');

  const list = await rpc('tools/list');
  const names = list.result.tools.map((t) => t.name).sort();
  check(names.length === 4);
  check(names.includes('xiio_product_split_status'));
  check(names.includes('xiio_desktop_health'));
  check(names.includes('xiio_articles_health'));
  check(names.includes('xiio_publisher_health'));

  const status = await rpc('tools/call', { name: 'xiio_product_split_status' });
  check(status.result.isError === false);
  const body = JSON.parse(status.result.content[0].text);
  check(body.inbox_mcp_server === 'xiio-inbox-zed');
  check(body.products.desktop.bound === true);
  check(body.products.articles.bound === true);
  check(body.products.publisher.bound === true);
  check(body.effect_performed === false);

  const unknown = await rpc('tools/call', { name: 'xiio_inbox_health' });
  check(unknown.result.isError === true);
  check(JSON.parse(unknown.result.content[0].text).code === 'UNKNOWN_TOOL');

  console.log(JSON.stringify({ state: 'PASS', checks, tools: names }));
} finally {
  child.kill('SIGTERM');
  server.close();
}
