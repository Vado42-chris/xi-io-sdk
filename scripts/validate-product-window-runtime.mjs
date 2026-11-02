import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createBlackProductWindowSession,
  markBlackProductWindowDirty,
  beginBlackProductWindowWrite,
  recordBlackProductWindowWriteOutcome,
  reconcileBlackProductWindowReadback,
} from '../src/window/black-product-window-session.mjs';
import {
  createProductWindowAdapter,
  composeProductWindow,
  mountProductBody,
  assertProductSwitchIsolation,
} from '../src/window/product-window-adapter.mjs';
import {
  defaultBlackWindowSettings,
  updateBlackWindowSettings,
  validateBlackWindowSettings,
} from '../src/window/black-window-settings.mjs';

const checks=[];
const ok=(id,fn)=>{ try{ fn(); checks.push({id,pass:true}); }catch(error){ checks.push({id,pass:false,error:String(error?.message||error)}); } };

const authority={principal_ref:'principal:test',capability_refs:['artifact:write'],effect_ceiling:'TEST_ONLY'};
const resource=(id)=>({resource_ref:id,opened_version_ref:'1',current_version_ref:'1',content_digest:'sha:1',profile_id:'profile:test'});
const context=(id)=>({workspace_ref:id,project_ref:'project:test',domain_context_ref:'domain:test'});

let s=createBlackProductWindowSession({session_ref:'session:A',window_ref:'window:A',host_kind:'studio_virtual',product_id:'product:A',resource:resource('artifact:A'),context:context('workspace:A'),authority});
s=markBlackProductWindowDirty(s,{working_version_ref:'working:2',working_digest:'sha:2'});
s=beginBlackProductWindowWrite(s,{operation_ref:'save:A',attempt_ref:'attempt:A',expected_version_ref:'1'});
s=recordBlackProductWindowWriteOutcome(s,{operation_ref:'save:A',attempt_ref:'attempt:A',outcome:'written_unverified',new_version_ref:'2',content_digest:'sha:2'});
ok('READBACK_MISMATCH_NE_VERIFIED',()=>assert.equal(reconcileBlackProductWindowReadback(s,{resource_ref:'artifact:A',version_ref:'99',content_digest:'sha:wrong'}).state,'CONFLICT'));
ok('READBACK_MATCH_VERIFIED',()=>assert.equal(reconcileBlackProductWindowReadback(s,{resource_ref:'artifact:A',version_ref:'2',content_digest:'sha:2'}).state,'VERIFIED'));

const mk=(id,workspace)=>createProductWindowAdapter({
  product_id:id,body_id:id+'.body',body_ref:'src/'+id+'.jsx',body_generation:'blob:'+id,
  branding:{family:'suite',chroma:id==='studio'?'brown':'cyan',variant_ref:'brand:'+id},
  settings_scope:'settings:'+id,domain_actions:['edit'],
  resource:resource('artifact:'+id),context:context(workspace),authority,
  persistence:{save_operation_ref:'save:'+id,readback_operation_ref:'read:'+id},
  studio_return_ref:'return:'+id
});
const a=composeProductWindow(mk('studio','workspace:shared'),{session_ref:'session:studio',window_ref:'window:studio'});
const b=composeProductWindow(mk('inbox','workspace:shared'),{session_ref:'session:inbox',window_ref:'window:inbox'});
ok('PRODUCT_SWITCH_CONTEXT_ISOLATION',()=>assert.equal(assertProductSwitchIsolation(a,b).ok,true));
const mounted=await mountProductBody(a,{mountTarget:'target:A',mountBody:async input=>({product_id:input.product_id,body_id:input.body_id,body_ref:input.body_ref,mounted:true})});
ok('REAL_BODY_MOUNT_CONTRACT',()=>assert.equal(mounted.mounted,true));

const settings=updateBlackWindowSettings(defaultBlackWindowSettings(),{density:'compact',paid_provider_fallback:'never'});
ok('SETTINGS_VALID',()=>assert.equal(validateBlackWindowSettings(settings).ok,true));
ok('SETTINGS_NE_AUTHORITY',()=>assert.equal(settings.authority_granted,false));

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
ok('PACKAGE_EXPORT_PRODUCT_SESSION',()=>assert.equal(pkg.exports['./window/product-session'],'./src/window/black-product-window-session.mjs'));
ok('PACKAGE_EXPORT_PRODUCT_ADAPTER',()=>assert.equal(pkg.exports['./window/product-adapter'],'./src/window/product-window-adapter.mjs'));
ok('PACKAGE_EXPORT_WINDOW_SETTINGS',()=>assert.equal(pkg.exports['./window/settings'],'./src/window/black-window-settings.mjs'));
ok('PACKAGE_PRESERVES_WORKER_CONNECTION',()=>assert.equal(pkg.exports['./worker/connection'],'./src/worker/connection.mjs'));

const failed=checks.filter(x=>!x.pass);
console.log(JSON.stringify({schema:'xiio.sdk.product-window-runtime-check/v1',pass:checks.length-failed.length,fail:failed.length,checks},null,2));
if(failed.length) process.exitCode=1;
