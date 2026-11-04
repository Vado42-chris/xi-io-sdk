import assert from 'node:assert/strict';
import {
  XIIO_PRODUCT_LINEUP,
  PRODUCT_WINDOW_TEMPLATE,
  stampAllProducts,
  compileProductWindowSession,
} from '../src/product-window/registry.mjs';
import { productWindowProductStage } from '../src/product-window/contract.mjs';

const expected = [
  'xi-io:desktop','xi-io:ibal','xi-io:switchboard','xi-io:movie-time','xi-io:hex',
  'xi-io:repo-reaper','xi-io:wordpress','xi-io:ward','xi-io:inbox','xi-io:bins',
  'xi-io:cadence','xi-io:benchmark','xi-io:publisher','xi-io:dataforge','xi-io:photoforge',
  'xi-io:vectorforge','xi-io:filmforge','xi-io:lightforge','xi-io:pdfforge','xi-io:effectforge',
  'xi-io:designeforge','xi-io:wordforge','xi-io:soundforge','xi-io:gridforge','xi-io:deckforge',
  'xi-io:cadforge','xi-io:txtureforge','xi-io:solidforge','xi-io:dev_forge',
];

assert.deepEqual(XIIO_PRODUCT_LINEUP.map((x) => x.product_ref), expected);
assert.equal(new Set(expected).size, expected.length);
for (const stamp of stampAllProducts()) {
  assert.equal(stamp.intermediary_template, PRODUCT_WINDOW_TEMPLATE);
  assert.equal(stamp.project_management, 'REQUIRED');
  assert.equal(stamp.chat, 'REQUIRED');
  assert.deepEqual(stamp.frame_settings, ['BLACK_LEVEL']);
  assert.deepEqual(stamp.frame_controls, ['MINIMIZE','MAXIMIZE_RESTORE','CLOSE']);
  assert.equal(stamp.product_settings_location, 'INSIDE_PRODUCT_BODY');
  assert.equal(stamp.linux_surface, 'REQUIRED');
  assert.equal(stamp.empire_os_surface, 'REQUIRED');
}
const gate = compileProductWindowSession({ product_ref:'xi-io:ibal', project_ref:'project:demo', chat_ref:'chat:demo' });
assert.equal(gate.stage,'INTERMEDIARY');
assert.equal(gate.intermediary.show_project_manager,true);
assert.equal(gate.intermediary.show_chat,true);
assert.equal(gate.intermediary.product_settings_visible_here,false);
const body = productWindowProductStage({
  product_ref:'xi-io:ibal',
  project_ref:'project:demo',
  chat_ref:'chat:demo',
  body_ref:'body:ibal',
});
assert.equal(body.stage,'PRODUCT_BODY');
assert.equal(body.project_management,'BOUND');
assert.equal(body.chat,'BOUND');

const dev = XIIO_PRODUCT_LINEUP.find(x => x.product_ref === 'xi-io:dev_forge');
assert.equal(dev.lifecycle,'STARTED_NOT_FINISHED');
assert.equal(dev.troubleshooting_surface.forge_anything,'ABSORBED_INTO_DEV_FORGE');
assert.deepEqual(dev.troubleshooting_surface.combines, ['xi-io:Dev_forge','xi-io:ibal','@xi-io/sdk','xi-io:cli']);

console.log(JSON.stringify({
  schema:'xiio.product-window-lineup-check/v1',
  products:expected.length,
  stamped:stampAllProducts().length,
  template:PRODUCT_WINDOW_TEMPLATE,
  dev_forge:dev.lifecycle,
  pass:true,
},null,2));
