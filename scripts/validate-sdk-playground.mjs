#!/usr/bin/env node
import assert from 'node:assert/strict';
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

const publicBlob = [JSON.stringify(catalog), playground, index, readme].join('\n');
for (const forbidden of [
  'Vado42-chris/xi-io.net',
  'product-donor:',
  'UI-CONSUMER-EXPORT',
  'sam_law',
  'Andersen',
  'Hallberg',
  'framework #',
  'issue #',
]) {
  assert(!publicBlob.includes(forbidden), `public disclosure leak: ${forbidden}`);
}

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
