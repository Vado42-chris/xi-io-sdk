#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Core from '../src/components/core.mjs';
import * as Shell from '../src/components/shell.mjs';
import { callableUuidFor, listCallablePrimitives, resolveCallable } from '../src/callables/resolve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const catalog = JSON.parse(read('src/catalog/primitives.json'));
const playground = read('playground/playground.mjs');
const index = read('playground/index.html');
const readme = read('README.md');
const coreSource = read('src/components/core.mjs');
const validatorSource = read('scripts/validate-sdk-playground.mjs');

assert.equal(catalog.schema, 'xiio.sdk.primitive-catalog/v2');
assert.equal(catalog.public_contract.component_source, 'THIS_REPOSITORY');
assert.equal(catalog.public_contract.internal_management_surface, 'OPAQUE_WARD_PROTECTED');
assert.equal(catalog.public_contract.internal_provenance_disclosed, false);
assert.equal(catalog.public_contract.internal_topology_disclosed, false);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert(UUID.test(catalog.callable_namespace_uuid), 'namespace UUID malformed');
assert(Array.isArray(catalog.primitives) && catalog.primitives.length >= 20, 'primitive denominator too small');

const ids = new Set();
const uuids = new Set();
for (const item of catalog.primitives) {
  assert(typeof item.id === 'string' && item.id, 'primitive id required');
  assert(!ids.has(item.id), `duplicate id ${item.id}`);
  ids.add(item.id);
  assert(UUID.test(item.callable_uuid), `${item.id}: callable UUID malformed`);
  assert(!uuids.has(item.callable_uuid), `${item.id}: duplicate callable UUID`);
  uuids.add(item.callable_uuid);
  assert.equal(resolveCallable(catalog, item.callable_uuid)?.id, item.id, `${item.id}: UUID resolution`);
  assert.equal(callableUuidFor(catalog, item.id), item.callable_uuid, `${item.id}: reverse UUID resolution`);
  assert.equal(typeof item.source, 'string', `${item.id}: source path`);
  assert(fs.existsSync(path.join(root, item.source)), `${item.id}: source missing`);
  if (item.style) assert(fs.existsSync(path.join(root, item.style)), `${item.id}: style missing`);
}
assert.equal(listCallablePrimitives(catalog).length, catalog.primitives.length, 'callable list denominator');
assert.equal(resolveCallable(catalog, 'not-a-uuid'), null, 'invalid callable must not resolve');
assert.equal(callableUuidFor(catalog, 'does-not-exist'), null, 'unknown primitive must not mint UUID');

/** Opaque disclosure probes: packed bytes + digests only (no private plaintext in tip tree). */
const DISCLOSURE_PACK_KEY = Buffer.from('xiio.sdk.disclosure/v1');
const DISCLOSURE_PACKS = Object.freeze([
  { sha256: '3ddae38f1583d6aaa82d597d0e0992393ae777bab9e43adf3da6e78fba0f6e0f', xor: '2e080d001a414908461600004c14065e1c1d4b411345' },
  { sha256: '69f644656bea5aff3214976282605cce5290c46f95a0fd5544e39cb1c357cc6e', xor: '081b060b5b1010464a0b071c1156' },
  { sha256: '493443c4babd0d1f24dd592380e755b5bacc731073f7e0ac30297282292c2fa6', xor: '2d20442c613d373e63213b5e26343f3c2726' },
  { sha256: '6f60dc079778ddeecb48ce6828149c141cf87265d3233dab7cd0ebef7dd7c134', xor: '0b080430421213' },
  { sha256: 'db6bd9102ad603cbeb66ac8a663cf9caba72c124e393703306cd19923130bd94', xor: '39070d0a5c000105' },
  { sha256: 'b93916f1e19cf68fb89db32bb79deb318c7465e46f794fc6836285751d7d1f58', xor: '300805034c16160c' },
  { sha256: 'dbb810f2a36832322e3f50c494ca8abac4feac51fb00bc394b7d7123f628c30e', xor: '1e1b08024b040b1945444a' },
  { sha256: '0767e4db3c9122b1902bc8cf1bf8af81f3c29d0f75e60977418c4d33ca343960', xor: '111a1a1a4b5347' },
]);

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function unpackDisclosureProbes() {
  return DISCLOSURE_PACKS.map(pack => {
    const packed = Buffer.from(pack.xor, 'hex');
    const out = Buffer.alloc(packed.length);
    for (let i = 0; i < packed.length; i += 1) {
      out[i] = packed[i] ^ DISCLOSURE_PACK_KEY[i % DISCLOSURE_PACK_KEY.length];
    }
    const token = out.toString('utf8');
    assert.equal(sha256Hex(token), pack.sha256, 'disclosure probe digest mismatch');
    return token;
  });
}

function loadOptionalDenylist() {
  const fromEnv = process.env.XIIO_SDK_DISCLOSURE_DENYLIST;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return JSON.parse(fs.readFileSync(fromEnv, 'utf8'));
  }
  const localPath = path.join(root, '.local', 'disclosure-denylist.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  }
  return null;
}

function assertOpaqueProbesClean(blob, label) {
  const probes = unpackDisclosureProbes();
  const optional = loadOptionalDenylist();
  if (optional) {
    assert(Array.isArray(optional), 'optional denylist must be a JSON array');
    assert.equal(optional.length, probes.length, 'optional denylist count must match packed probes');
    for (let i = 0; i < optional.length; i += 1) {
      assert.equal(optional[i], probes[i], `optional denylist[${i}] must match packed probe`);
    }
  }
  for (const token of probes) {
    assert(!blob.includes(token), `${label}: opaque disclosure probe hit`);
  }
}

function assertStructuralFieldsAbsent(blob, label) {
  // Field-name anti-patterns for catalog/content only (not this validator's probe table).
  const structural = [
    /management_authority/i,
    /management_contracts/i,
    /"provenance"\s*:/,
  ];
  for (const re of structural) {
    assert(!re.test(blob), `${label}: structural disclosure leak ${re}`);
  }
}

const contentTracked = [
  'package.json',
  'README.md',
  'src/catalog/primitives.json',
  'src/callables/resolve.mjs',
  'src/components/core.mjs',
  'src/components/shell.mjs',
  'src/components/behavior.mjs',
  'src/styles/core.css',
  'src/styles/shell.css',
  'playground/index.html',
  'playground/playground.mjs',
  'playground/playground.css',
  '.github/workflows/check.yml',
];
const contentBlob = contentTracked.map(rel => read(rel)).join('\n');
const tipBlob = [contentBlob, validatorSource].join('\n');
assertStructuralFieldsAbsent(contentBlob, 'tip content tree');
assertOpaqueProbesClean(tipBlob, 'tip tracked tree');
assertOpaqueProbesClean(validatorSource, 'validator self');

// Hostile: injected probe must fail closed (memory-only; plaintext never written to tip).
const [hostileProbe] = unpackDisclosureProbes();
assert.throws(
  () => assertOpaqueProbesClean(hostileProbe, 'hostile inject'),
  /opaque disclosure probe hit/,
  'hostile inject must be detected',
);

assert(!coreSource.includes("attributes = ''"), 'raw arbitrary attribute escape hatch must stay removed');
assert.throws(() => Core.renderActionButton({ label: 'x', data: { 'Bad Key': 'x' } }), /invalid data attribute key/);
const safeButton = Core.renderActionButton({ label: '<Run>', dialogTarget: 'dialog"x', data: { 'playground-open': true } });
assert(safeButton.includes('&lt;Run&gt;'), 'button label escaped');
assert(safeButton.includes('data-xiui-dialog-target="dialog&quot;x"'), 'dialog target escaped');
assert(safeButton.includes('data-playground-open'), 'typed data attribute rendered');
assert(!safeButton.includes('<Run>'), 'raw label leaked');

assert(Core.renderPageShell({ bodyHtml: 'x' }).includes('data-xiui-root'));
assert(Core.renderStatusBadge({ label: 'ok', tone: 'bogus' }).includes('data-tone="unknown"'));
assert(Core.renderConfirmationDialog({ id: 'd', title: '<T>' }).includes('&lt;T&gt;'));
assert(Core.renderSelectableList({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], selectedId: 'b' }).includes('aria-selected="true"'));

assert(Shell.renderIconButton({ label: 'A"B' }).includes('aria-label="A&quot;B"'));
assert(Shell.renderScrollRegion({ label: 'Region', bodyHtml: 'x' }).includes('tabindex="0"'));
assert(Shell.renderDrawerShell({ open: false, title: 'D' }).includes('aria-hidden="true"'));
assert(Shell.renderToastStack([{ title: '<x>', summary: 's' }]).includes('&lt;x&gt;'));
assert(Shell.renderBreadcrumbs({ items: [{ label: 'A' }, { label: 'B' }] }).includes('aria-current="page"'));
assert(!Shell.renderBreadcrumbs({ items: [{ label: 'A' }, { label: 'B' }] }).includes('href="undefined"'));
assert(Shell.renderSelectField({ id: 's', options: [{ value: 'a', label: '<A>' }], value: 'a' }).includes('&lt;A&gt;'));
const tabs = Shell.renderTabs({ tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }], activeId: 'a' });
assert(tabs.includes('role="tablist"'));
assert(tabs.includes('aria-selected="true"'));
assert(tabs.includes('disabled aria-disabled="true"'));

assert(playground.includes('resolveCallable(catalog, item.callable_uuid)'), 'playground must resolve public UUID');
assert(playground.includes("[item.id, item.family, item.export, item.callable_uuid]"), 'playground search must include UUID');
assert(index.includes('protected Ward boundary'), 'public boundary copy missing');
assert(Array.isArray(catalog.known_gaps) && catalog.known_gaps.length > 0, 'known gaps must remain explicit');

console.log(`XIIO_SDK_PLAYGROUND PASS primitives=${catalog.primitives.length} uuids=${uuids.size} gaps=${catalog.known_gaps.length} internal_topology_leaks=0`);
