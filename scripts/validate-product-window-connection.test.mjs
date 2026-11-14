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
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type,new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    setAttribute() {},
    fire(type, event = {}) { return Promise.all([...listeners.get(type)||[]].map(fn=>fn({ preventDefault() {}, target: this, ...event }))); },
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


test('host acceptance followed by lost response remains unknown, never safe-to-retry proof', async () => {
  const ui=fixture(); let effects=0;
  ui.input.value='preserve me';
  bindProductWindowIntermediary(ui.root,{onChatSend:async()=>{effects++;throw Error('response lost');}});
  await ui.form.fire('submit');
  assert.equal(effects,1);
  assert.equal(ui.input.value,'preserve me');
  assert.match(ui.status.textContent,/acceptance is unknown/);
  assert.match(ui.status.textContent,/before retrying/);
  assert.doesNotMatch(ui.status.textContent,/not accepted|not been submitted/);
});

test('explicit host rejection differs from missing acceptance receipt', async () => {
  for(const accepted of [false,undefined,'true']) {
    const ui=fixture();ui.input.value='draft';
    bindProductWindowIntermediary(ui.root,{onChatSend:()=>({accepted})});
    await ui.form.fire('submit');
    assert.match(ui.status.textContent,accepted===false?/not accepted by the connected host/:/acceptance is unknown/);
    assert.equal(ui.input.value,'draft');
  }
});

test('project action failure does not claim no prior effect', async () => {
  for(const asyncFailure of [false,true]) {
    const ui=fixture();let effects=0;
    bindProductWindowIntermediary(ui.root,{onProjectNew:()=>{
      effects++;if(asyncFailure)return Promise.reject(Error('lost response'));throw Error('lost response');
    }});
    ui.newProject.fire('click');await Promise.resolve();await Promise.resolve();
    assert.equal(effects,1);
    assert.match(ui.status.textContent,/outcome is unknown/);
    assert.doesNotMatch(ui.status.textContent,/not been submitted/);
  }
});

 test('connection replacement restores only SDK-disabled controls and removes stale listeners', async () => {
  const ui=fixture(); let oldCalls=0,newCalls=0;
  const first=bindProductWindowIntermediary(ui.root);
  const second=bindProductWindowIntermediary(ui.root,{onOpenProduct:()=>oldCalls++,onChatSend:()=>{oldCalls++;return {accepted:true};}});
  assert.equal(ui.open.disabled,false);assert.equal(ui.button.disabled,false);
  const third=bindProductWindowIntermediary(ui.root,{onOpenProduct:()=>newCalls++,onChatSend:()=>{newCalls++;return {accepted:true};}});
  first();second();ui.input.value='hello';
  await ui.open.fire('click');await ui.form.fire('submit');
  assert.equal(oldCalls,0);assert.equal(newCalls,2);third();
  assert.equal(ui.open.disabled,true);assert.equal(ui.button.disabled,true);
});
test('pending chat stays single flight across connection replacement', async () => {
  const ui=fixture();ui.input.value='one';let resolve,calls=0;
  bindProductWindowIntermediary(ui.root,{onChatSend:()=>{calls++;return new Promise(r=>resolve=r);}});
  const first=ui.form.fire('submit');
  const dispose=bindProductWindowIntermediary(ui.root,{onChatSend:()=>{calls++;return {accepted:true};}});
  assert.equal(ui.button.disabled,false);await ui.form.fire('submit');assert.equal(calls,1);
  const before=ui.status.textContent;resolve({accepted:true});await first;
  assert.equal(ui.status.textContent,before);assert.equal(ui.input.value,'one');assert.equal(ui.button.disabled,false);
  await ui.form.fire('submit');assert.equal(calls,2);dispose();
});
test('external disabled controls remain disabled on connection and settlement',async()=>{
  const ui=fixture();ui.open.disabled=true;ui.button.disabled=true;
  bindProductWindowIntermediary(ui.root,{onOpenProduct:()=>{throw Error('disabled');},onChatSend:()=>{throw Error('disabled');}});
  assert.equal(ui.open.disabled,true);assert.equal(ui.button.disabled,true);
  await ui.open.fire('click');ui.input.value='draft';await ui.form.fire('submit');assert.equal(ui.input.value,'draft');
});

test('host disable during a pending chat survives completion',async()=>{
  const ui=fixture();ui.input.value='pending';let resolve;
  bindProductWindowIntermediary(ui.root,{onChatSend:()=>new Promise(r=>resolve=r)});
  const pending=ui.form.fire('submit');ui.button.disabled=true;
  resolve({accepted:false});await pending;assert.equal(ui.button.disabled,true);
});
