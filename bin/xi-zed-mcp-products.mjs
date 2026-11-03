#!/usr/bin/env node
// XI-IO SDK Zed MCP — Desktop / Articles / Publisher product-split facade.
// Separate from xiio-inbox-zed. Effect ceiling zero. Loopback only.
// Missing product runtimes return honest NOT_BOUND — never invent LIVE.
import { createInterface } from 'node:readline';

const VERSION = '2025-03-26';
const SERVER = 'xiio-products-zed';

const PRODUCTS = Object.freeze({
  desktop: {
    tool: 'xiio_desktop_health',
    label: 'Desktop',
    env: 'XIIO_DESKTOP_LOOPBACK_URL',
    fallback: 'http://127.0.0.1:5174/Console',
    schema: 'xiio.zed.desktop-health/v1',
  },
  articles: {
    tool: 'xiio_articles_health',
    label: 'Articles',
    env: 'XIIO_ARTICLES_LOOPBACK_URL',
    fallback: 'http://127.0.0.1:8870/estate/v1/catalog',
    schema: 'xiio.zed.articles-health/v1',
  },
  publisher: {
    tool: 'xiio_publisher_health',
    label: 'Publisher',
    env: 'XIIO_PUBLISHER_LOOPBACK_URL',
    fallback: 'http://127.0.0.1:8870/estate/v1/runtime',
    schema: 'xiio.zed.publisher-health/v1',
  },
});

function loopbackOrigin(raw, label) {
  const url = new URL(raw);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${label}_HOST_NOT_LOOPBACK`);
  }
  return { origin: url.origin, path: `${url.pathname}${url.search}` || '/' };
}

const productOrigins = {};
for (const [key, meta] of Object.entries(PRODUCTS)) {
  try {
    productOrigins[key] = loopbackOrigin(process.env[meta.env] || meta.fallback, key.toUpperCase());
  } catch (error) {
    process.stderr.write(`XIIO_PRODUCT_ENDPOINT_REJECTED:${key}: ${error.message}\n`);
    process.exit(78);
  }
}

const declarations = [
  {
    name: 'xiio_product_split_status',
    description:
      'Read-only status of Desktop/Articles/Publisher MCP wiring vs Inbox-only MCP. No effect authority.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  ...Object.values(PRODUCTS).map((meta) => ({
    name: meta.tool,
    description: `Inspect local ${meta.label} product loopback health. Read only. Does not publish, mutate Desktop, or execute Articles content.`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  })),
];

const err = (code, message) => ({ code, message });
const text = (x) => ({ content: [{ type: 'text', text: JSON.stringify(x) }], isError: false });
const failed = (code, detail) => ({
  content: [{ type: 'text', text: JSON.stringify({ ok: false, code, detail, effect_performed: false }) }],
  isError: true,
});

async function probe(key) {
  const meta = PRODUCTS[key];
  const { origin, path } = productOrigins[key];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(origin + path, {
      method: 'GET',
      headers: { accept: 'application/json,text/html;q=0.1' },
      signal: controller.signal,
      redirect: 'error',
    });
    const reachable = res.status > 0;
    const ok = res.status >= 200 && res.status < 400;
    return {
      schema: meta.schema,
      product: key,
      label: meta.label,
      reachable,
      http_status: res.status,
      bound: ok,
      first_red: ok ? null : `PRODUCT_RUNTIME_NOT_BOUND:${key.toUpperCase()}`,
      hard: [
        'INBOX_MCP!=PRODUCT_MCP',
        'HTTP_200!=PRODUCT_LIVE',
        'ARTICLES_CONTENT!=EXECUTABLE_INSTRUCTION',
        'PUBLISHER_PREP!=PUBLICATION_AUTHORIZATION',
        'DESKTOP_WINDOW!=NATIVE_HEX_SHELL',
      ],
      effect_performed: false,
      provider_effect: false,
      effect_authority: false,
    };
  } catch (e) {
    return {
      schema: meta.schema,
      product: key,
      label: meta.label,
      reachable: false,
      http_status: 0,
      bound: false,
      first_red: `PRODUCT_RUNTIME_UNREACHABLE:${key.toUpperCase()}`,
      detail: e.name === 'AbortError' ? 'timeout' : String(e.message || e),
      hard: ['INBOX_MCP!=PRODUCT_MCP', 'MISSING_PRODUCT_RUNTIME!=UNKNOWN_TOOL_SILENCE'],
      effect_performed: false,
      provider_effect: false,
      effect_authority: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function call(name, args) {
  if (Object.keys(args || {}).length) return failed('INVALID_ARGS', 'Unexpected arguments');
  if (name === 'xiio_product_split_status') {
    const probes = {};
    for (const key of Object.keys(PRODUCTS)) probes[key] = await probe(key);
    return text({
      schema: 'xiio.zed.product-split-status/v1',
      server: SERVER,
      inbox_mcp_server: 'xiio-inbox-zed',
      inbox_tools: ['xiio_inbox_health', 'xiio_agent_mail_list', 'xiio_agent_mail_qualify'],
      product_tools: Object.values(PRODUCTS).map((m) => m.tool),
      hard: [
        'THREE_INBOX_TOOLS!=ESTATE_MCP_SURFACE',
        'MISSING_DESKTOP_ARTICLES_PUBLISHER_MCP=YEAR_CLASS',
        'ACP_EXTERNAL_AGENT_MAY_NOT_FORWARD_MCP',
        'ASSISTANT_CONFORMANCE_BLOCKED!=ALWAYS_THIS_GAP',
      ],
      products: probes,
      effect_performed: false,
    });
  }
  for (const [key, meta] of Object.entries(PRODUCTS)) {
    if (name === meta.tool) return text(await probe(key));
  }
  return failed('UNKNOWN_TOOL', name);
}

function send(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
}

async function receive(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ id: null, error: err(-32700, 'Parse error') });
    return;
  }
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    send({ id: request?.id ?? null, error: err(-32600, 'Invalid Request') });
    return;
  }
  if (request.id === undefined) return;
  const { id, method, params = {} } = request;
  try {
    if (method === 'initialize') {
      send({
        id,
        result: {
          protocolVersion: VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER, version: '0.1.0' },
        },
      });
      return;
    }
    if (method === 'ping') {
      send({ id, result: {} });
      return;
    }
    if (method === 'tools/list') {
      send({ id, result: { tools: declarations } });
      return;
    }
    if (method === 'tools/call') {
      if (
        !params ||
        typeof params.name !== 'string' ||
        (params.arguments !== undefined &&
          (typeof params.arguments !== 'object' ||
            params.arguments === null ||
            Array.isArray(params.arguments)))
      ) {
        send({ id, error: err(-32602, 'Invalid params') });
        return;
      }
      send({ id, result: await call(params.name, params.arguments ?? {}) });
      return;
    }
    send({ id, error: err(-32601, 'Method not found') });
  } catch (e) {
    send({ id, result: failed(e.code || 'INTERNAL_FAILURE', e.message || 'Unknown failure') });
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (line.trim()) await receive(line);
}
