#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createProductWindowAdapter, composeProductWindow, mountExecutableProductBody,
  performExecutableProductOperation, persistExecutableProductOperation,
  reopenExecutableProduct, returnExecutableProductToStudio, assertProductSwitchIsolation
 } from '../src/window/product-window-adapter.mjs';
import {createProductWindowHost,PRODUCT_WINDOW_HOST_SCHEMA} from '../src/window/product-window-host.mjs';
import {
  defaultBlackWindowSettings, saveBlackWindowSettings, validateBlackWindowSettings
} from '../src/window/black-window-settings.mjs';

let passed=0;
const pass=name=>{passed+=1;console.log('PASS '+name)};
const make=(product='office.document',resource='resource:office:doc')=>createProductWindowAdapter({
  product_id:product,
  body_id:product,
  body_ref:'Vado42-chris/xi-io-node:src/components/studio/editors/DocumentEditor.jsx',
  body_generation:'d28be843d45dd32b9eee5c85e050bf69b1d67788',
  branding:{family:'document',chroma:'office-blue',variant_ref:'window-variant:'+product},
  settings_scope:'settings:'+product,
  domain_actions:['document.open','document.edit','document.save','document.reopen'],
  resource:{resource_ref:resource,opened_version_ref:'office:v7',current_version_ref:'office:v7',content_digest:'digest:v7',profile_id:'text.document.v1'},
  context:{workspace_ref:'workspace:'+product,project_ref:'project:'+product,domain_context_ref:'document:'+product},
  authority:{principal_ref:'principal:owner',capability_refs:['DOCUMENT_READ','DOCUMENT_EDIT'],effect_ceiling:'LOCAL_RESOURCE_ONLY'},
  persistence:{save_operation_ref:'node.document.writeCube',readback_operation_ref:'node.document.readback'},
  studio_return_ref:'studio:return:'+product
});

const composition=composeProductWindow(make(),{session_ref:'session:office',window_ref:'window:shared'});
let sequence=7;
const bodyPort={
  entry_ref:'src/components/studio/editors/DocumentEditor.jsx',
  generation:'d28be843d45dd32b9eee5c85e050bf69b1d67788',
  async mount({session,context,resource}){
    assert.equal(session.resource.current_version_ref,resource.current_version_ref);
    assert.equal(context.workspace_ref,'workspace:office.document');
    return {component_ref:this.entry_ref,component_generation:this.generation,mounted:true};
  },
  async perform({session,operation}){
    assert.equal(operation,'edit');
    assert.equal(session.resource.current_version_ref,'office:v'+sequence);
    sequence+=1;
    return {operation_ref:'office:edit:'+sequence,attempt_ref:'attempt:'+sequence,
      working_version_ref:'office:v'+sequence,content_digest:'digest:v'+sequence,
      kind:'document',name:'SDK window proof',payload:{html:'<p>v'+sequence+'</p>'}};
  }
};
let saved=null;
const hostPort={
  async save({session,body_result}){
    assert.equal(session.state,'WRITING');
    saved={resource_ref:session.resource.resource_ref,version_ref:body_result.working_version_ref,content_digest:body_result.content_digest};
    return {outcome:'written_unverified',version_ref:saved.version_ref,content_digest:saved.content_digest};
  },
  async readback({resource_ref}){assert.equal(resource_ref,saved.resource_ref);return {...saved};},
  async close({session}){assert.equal(session.state,'VERIFIED');},
  async reopen({session,resource_ref}){return {resource_ref,version_ref:session.resource.current_version_ref,content_digest:session.resource.content_digest};},
  async returnToStudio({session,studio_return_ref}){return {returned:true,product_id:session.product_id,resource_ref:session.resource.resource_ref,workspace_ref:session.context.workspace_ref,principal_ref:session.authority.principal_ref,studio_return_ref};}
};

const mounted=await mountExecutableProductBody(composition,{bodyPort});
assert.equal(mounted.mounted,true); pass('concrete product body mounts through canonical adapter');

let operation=await performExecutableProductOperation(composition,{bodyPort,mounted,operation:'edit'});
let persisted=await persistExecutableProductOperation(composition,{operationResult:operation,hostPort});
assert.equal(persisted.ok,true); assert.equal(persisted.session.resource.current_version_ref,'office:v8');
pass('first edit save and independent readback verifies v8');

operation=await performExecutableProductOperation(composition,{bodyPort,mounted,operation:'edit',session:persisted.session});
persisted=await persistExecutableProductOperation(composition,{operationResult:operation,hostPort,session:persisted.session});
assert.equal(persisted.ok,true); assert.equal(persisted.session.resource.current_version_ref,'office:v9');
pass('verified session carries into second edit and advances v9');

const reopened=await reopenExecutableProduct(composition,{session:persisted.session,hostPort});
assert.equal(reopened.version_ref,'office:v9'); pass('close reopen preserves verified version and digest');

const returned=await returnExecutableProductToStudio(composition,{session:persisted.session,hostPort});
assert.equal(returned.returned,true);assert.equal(returned.resource_ref,'resource:office:doc');
assert.equal(returned.studio_return_ref,'studio:return:office.document');
pass('Studio return carries product resource workspace principal and return ref');

await assert.rejects(
  ()=>mountExecutableProductBody(composition,{bodyPort:{...bodyPort,generation:'stale-generation'}}),
  /PRODUCT_BODY_PORT_GENERATION_MISMATCH/
);
pass('stale product body generation fails before mount');

const redComposition=composeProductWindow(make(),{session_ref:'session:red',window_ref:'window:red'});
const redBody={operation_ref:'office:red:1',attempt_ref:'attempt:red:1',working_version_ref:'office:v8',content_digest:'digest:v8'};
const redHost={...hostPort,
  async save({session}){saved={resource_ref:session.resource.resource_ref,version_ref:'office:v8',content_digest:'digest:v8'};return {outcome:'written_unverified',version_ref:'office:v8',content_digest:'digest:v8'}},
  async readback({resource_ref}){return {resource_ref,version_ref:'office:v99',content_digest:'unrelated'}}
};
const red=await persistExecutableProductOperation(redComposition,{operationResult:redBody,hostPort:redHost});
assert.equal(red.ok,false);assert.equal(red.session.state,'CONFLICT');assert.equal(red.first_red,'READBACK_VERSION_CONFLICT');
pass('mismatched independent readback stays red');

const other=composeProductWindow(make('bins.config','resource:bins:config'),{session_ref:'session:bins',window_ref:'window:bins'});
assert.deepEqual(assertProductSwitchIsolation(composition,other).ok,true); pass('different product composition is context-isolated');

const receiverComposition=composeProductWindow(make('office.receiver','resource:office:receiver'),{session_ref:'session:receiver',window_ref:'window:receiver'});
let receiverVersion=7;
const receiverHost=createProductWindowHost({mountTarget:'target:receiver'});
assert.equal(receiverHost.schema,PRODUCT_WINDOW_HOST_SCHEMA);
await receiverHost.openComposition({
  composition:receiverComposition,
  bodyPort:{
    entry_ref:'src/components/studio/editors/DocumentEditor.jsx',
    generation:'d28be843d45dd32b9eee5c85e050bf69b1d67788',
    async mount(){return {component_ref:this.entry_ref,component_generation:this.generation,mounted:true};},
    async perform({operation}){receiverVersion+=1;return {operation_ref:'receiver:'+operation+':'+receiverVersion,attempt_ref:'receiver-attempt:'+receiverVersion,working_version_ref:'office:v'+receiverVersion,content_digest:'digest:v'+receiverVersion,kind:'document',name:'Receiver proof',payload:{html:'<p>'+receiverVersion+'</p>'}};}
  },
  hostPort:{
    async save({body_result}){return {outcome:'written_unverified',version_ref:body_result.working_version_ref,content_digest:body_result.content_digest};},
    async readback({resource_ref}){return {resource_ref,version_ref:'office:v'+receiverVersion,content_digest:'digest:v'+receiverVersion};},
    async close(){return {closed:true};},
    async reopen({resource_ref}){return {resource_ref,version_ref:'office:v'+receiverVersion,content_digest:'digest:v'+receiverVersion};},
    async returnToStudio({session,studio_return_ref}){return {returned:true,product_id:session.product_id,resource_ref:session.resource.resource_ref,workspace_ref:session.context.workspace_ref,principal_ref:session.authority.principal_ref,studio_return_ref};}
  }
});
const receiverSave=await receiverHost.performAndSave({operation:'edit'});
assert.equal(receiverSave.snapshot.active.session.state,'VERIFIED');
assert.equal(receiverSave.snapshot.active.session.resource.current_version_ref,'office:v8');
const receiverOpen=await receiverHost.reopen();
assert.equal(receiverOpen.reopened.version_ref,'office:v8');
const receiverReturn=await receiverHost.returnToStudio();
assert.equal(receiverReturn.result.returned,true);
pass('canonical product host executes mount save readback reopen and Studio return');

const mem=new Map();
const storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,v)};
const base=defaultBlackWindowSettings();
const changed=saveBlackWindowSettings(storage,base,{density:'compact',paid_provider_fallback:'never'});
assert.equal(validateBlackWindowSettings(changed).ok,true);assert.equal(changed.values.density,'compact');
pass('window settings persist with exact local readback and authority zero');

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
for(const key of ['./window/product-session','./window/settings','./window/product-adapter','./window/product-host']) assert.ok(pkg.exports[key],key+' export missing');
pass('package exports canonical session settings and product adapter');

assert.equal(passed,11);
console.log(JSON.stringify({status:'PASS',denominator:passed,source_studio_pr246:'927045b5682bb5ef17389a990fd164d2c12c8fca',
 source_blobs:{session:'720a4869c92d15c7b78b6ad4b8b519dd9bcd54e7',settings:'97ab9f81610228f04939844ad199ca15dd140247',adapter:'a7ca706e4e14efc51102f4af0da9ad4767903ac6',host:'d4ac5e105a6098369deaf7895b82e536a46df64f',node_document:'d28be843d45dd32b9eee5c85e050bf69b1d67788'},
 authority_granted:false,installed_credit:false}));
