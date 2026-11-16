import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProductInstallClosure, PRODUCT_INSTALL_CLOSURE_SCHEMA} from '../src/install/product-install-closure.mjs';

const registry = {
  law: {ref:'law',kind:'product',dependencies:['ward','bins','mail']},
  game: {ref:'game',kind:'product',dependencies:['ward','session']},
  ward: {ref:'ward',kind:'service',dependencies:[]},
  bins: {ref:'bins',kind:'service',dependencies:['ward']},
  mail: {ref:'mail',kind:'service',dependencies:[]},
  session: {ref:'session',kind:'service',dependencies:['ward']},
};
const plan = (overrides={}) => resolveProductInstallClosure({schema:PRODUCT_INSTALL_CLOSURE_SCHEMA,mode:'product',product_ref:'law',registry,...overrides});

test('product scope omits unrelated game and its session service',()=>{
  const result=plan();
  assert.deepEqual(result.install_order,['ward','bins','mail','law']);
  assert.deepEqual(result.visible_products,['law']);
  assert.deepEqual(result.headless_services,['ward','bins','mail']);
  assert.equal(result.installed,false);
  assert.equal(result.authority_granted,false);
});
test('suite is an explicit separate mode',()=>{
  const result=plan({mode:'suite'});
  assert.deepEqual(result.visible_products,['game','law']);
  assert.equal(result.install_order.filter(id=>id==='ward').length,1);
});
test('unknown product refused, including inherited property name',()=>{
  assert.throws(()=>plan({product_ref:'__proto__'}),/INSTALL_(PRODUCT_UNKNOWN|SCOPE_INVALID)/);
});
test('missing transitive dependency refused',()=>{
  const {ward,...incomplete}=registry;
  assert.throws(()=>plan({registry:incomplete}),/INSTALL_DEPENDENCY_MISSING/);
});
test('cycle refused',()=>{
  assert.throws(()=>plan({registry:{...registry,ward:{...registry.ward,dependencies:['bins']}}}),/INSTALL_DEPENDENCY_CYCLE/);
});
test('duplicate and self dependencies refused',()=>{
  assert.throws(()=>plan({registry:{...registry,law:{...registry.law,dependencies:['ward','ward']}}}),/INSTALL_NODE_INVALID/);
  assert.throws(()=>plan({registry:{...registry,law:{...registry.law,dependencies:['law']}}}),/INSTALL_NODE_INVALID/);
});
test('forged identity and malformed graph refused',()=>{
  assert.throws(()=>plan({registry:{...registry,law:{...registry.law,ref:'game'}}}),/INSTALL_NODE_INVALID/);
  assert.throws(()=>plan({registry:{...registry,law:{...registry.law,dependencies:'ward'}}}),/INSTALL_NODE_INVALID/);
});
test('unknown mode cannot silently select suite',()=>{
  assert.throws(()=>plan({mode:'anything'}),/INSTALL_SCOPE_INVALID/);
});

test('registry getter cannot cause an effect during planning',()=>{
  let effects=0;
  const malicious={...registry};
  Object.defineProperty(malicious,'ward',{enumerable:true,get(){effects++;return registry.ward;}});
  assert.throws(()=>plan({registry:malicious}),/INSTALL_ACCESSOR_REFUSED/);
  assert.equal(effects,0);
});
test('node and dependency-index getters cannot execute during planning',()=>{
  let effects=0;
  const changed={...registry, law:{...registry.law}};
  Object.defineProperty(changed.law,'kind',{enumerable:true,get(){effects++;return 'product';}});
  assert.throws(()=>plan({registry:changed}),/INSTALL_ACCESSOR_REFUSED/);
  const deps=['ward','bins','mail'];
  Object.defineProperty(deps, '0', {enumerable:true, get(){effects++;return 'ward';}});
  assert.throws(()=>plan({registry:{...registry,law:{...registry.law,dependencies:deps}}}),/INSTALL_ACCESSOR_REFUSED/);
  assert.equal(effects,0);
});
