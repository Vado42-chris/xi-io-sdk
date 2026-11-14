import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (await readFile(new URL('../src/product-window/intermediary.mjs', import.meta.url), 'utf8'))
  .replace("import { resolveProductWindow } from './registry.mjs';", 'const resolveProductWindow = () => ({product_ref:"product:test",label:"Test",family:"Test",lifecycle:"AVAILABLE"});');
const { bindProductWindowIntermediary, renderProductWindowIntermediary } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

function control() {
  const listeners = new Map();
  return {
    value: '', disabled: false, textContent: '',
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    setAttribute() {},
    fire(type, event = {}) { return listeners.get(type)?.({ preventDefault() {}, target: this, ...event }); },
  };
}

function fixture() {
  const status = control();
  const input = control();
  const button = control();
  const form = control();
  form.querySelector = (selector) => selector === '[type="submit"]' ? button : input;
  const select = control();
  const newProject = control();
  const manage = control();
  const open = control();
  const mapping = {
    '[data-xiio-product-window-status]': status,
    '[data-xiio-chat-form]': form,
    '[data-xiio-project-select]': select,
    '[data-xiio-project-new]': newProject,
    '[data-xiio-project-manage]': manage,
    '[data-xiio-product-open]': open,
  };
  return { root: { querySelector: (selector) => mapping[selector] }, status, input, button, form, select, newProject, manage, open };
}

test('missing connections disable rather than present functioning actions', () => {
  const ui = fixture();
  bindProductWindowIntermediary(ui.root);
  assert.equal(ui.button.disabled, true);
  assert.equal(ui.select.disabled, true);
  assert.equal(ui.open.disabled, true);
  assert.match(ui.status.textContent, /unavailable/);
});

test('rejected, thrown and undefined sends retain exact draft', async () => {
  for (const onChatSend of [() => ({ accepted: false }), () => { throw Error('offline'); }, () => undefined, async () => { throw Error('network'); }]) {
    const ui = fixture();
    ui.input.value = '  preserve exact unsent text  ';
    bindProductWindowIntermediary(ui.root, { onChatSend });
    await ui.form.fire('submit');
    assert.equal(ui.input.value, '  preserve exact unsent text  ');
    assert.match(ui.status.textContent, /draft is preserved/);
    assert.equal(ui.button.disabled, false);
  }
});

test('accepted send clears only unchanged text and avoids parallel submit', async () => {
  let resolve;
  let sends = 0;
  const ui = fixture();
  ui.input.value = 'One';
  const dispose = bindProductWindowIntermediary(ui.root, { onChatSend: () => { sends++; return new Promise((r) => { resolve = r; }); } });
  const first = ui.form.fire('submit');
  await ui.form.fire('submit');
  assert.equal(sends, 1);
  ui.input.value = 'Second draft';
  resolve({ accepted: true });
  await first;
  assert.equal(ui.input.value, 'Second draft');
  assert.match(ui.status.textContent, /not yet verified/);
  dispose();
});

test('rendered product identity remains escaped', () => {
  const html = renderProductWindowIntermediary({ product_ref: 'product:test', recent_projects: [{ project_ref: 'x', label: '<img>' }] });
  assert.match(html, /&lt;img&gt;/);
  assert.doesNotMatch(html, /<img>/);
});
