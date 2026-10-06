import assert from 'node:assert/strict';
import {compileToolchestStrip,composeToolchestStrips} from '../src/flatpack/toolchest-strips.mjs';
const make=(product,user)=>[
 compileToolchestStrip({kind:'NAVIGATION',strip_ref:'strip:navigation',product_ref:product,user_ref:user,selection_ref:'state:selection',filter_ref:'state:filter',workspace_ref:'state:workspace',components:[
  {component_ref:'nav:groups',role:'grouped_navigation',capability_ref:'cap:navigate'},
  {component_ref:'nav:search',role:'page_search',capability_ref:'cap:search-pages'},
  {component_ref:'nav:estate',role:'ask_estate',capability_ref:'cap:ask-estate'},
  {component_ref:'nav:workspace',role:'workspace_context',capability_ref:'cap:workspace-context'},
  {component_ref:'nav:identity',role:'identity_context',capability_ref:'cap:identity-context'}]}),
 compileToolchestStrip({kind:'CONTEXT_TOOLKIT',strip_ref:'strip:context-toolkit',product_ref:product,user_ref:user,selection_ref:'state:selection',filter_ref:'state:filter',workspace_ref:'state:workspace',components:[
  {component_ref:'toolkit:header',role:'toolkit_header',capability_ref:'cap:toolkit-context'},
  {component_ref:'toolkit:surface',role:'surface_projection',capability_ref:'cap:surface-projection'},
  {component_ref:'toolkit:settings',role:'settings_projection',capability_ref:'cap:settings-projection'},
  {component_ref:'toolkit:categories',role:'cross_filter_categories',capability_ref:'cap:cross-filter'},
  {component_ref:'toolkit:construct',role:'construct_context',capability_ref:'cap:construct'},
  {component_ref:'toolkit:addons',role:'addon_store_projection',capability_ref:'cap:addon-store'}]}),
 compileToolchestStrip({kind:'UTILITY_RAIL',strip_ref:'strip:utility-rail',product_ref:product,user_ref:user,selection_ref:'state:selection',filter_ref:'state:filter',workspace_ref:'state:workspace',components:[
  {component_ref:'rail:surface-shortcuts',role:'surface_shortcuts',capability_ref:'cap:surface-shortcuts'}]})
];
let pass=0;
const products=['studio','inbox','ward','publisher','hex','benchmark','sam-law','articles','desktop','mobile'];
const users=['owner','designer','developer','reviewer','client','admin','guest','agent','team','tenant'];
for(let i=0;i<100;i++){
 const strips=make('product:'+products[i%10],'user:'+users[Math.floor(i/10)]);
 const out=composeToolchestStrips(strips);
 assert.equal(out.strips.length,3);assert.equal(Object.keys(out.capability_owners).length,12);
 assert.equal(out.contracts.selection_ref,'state:selection');assert.equal(out.contracts.filter_ref,'state:filter');assert.equal(out.contracts.workspace_ref,'state:workspace');
 pass++;
}
assert.equal(pass,100);
const bad=make('product:studio','user:owner');
bad[2]=compileToolchestStrip({kind:'UTILITY_RAIL',strip_ref:'strip:utility-rail',product_ref:'product:studio',user_ref:'user:owner',components:[{component_ref:'rail:bad',role:'bad_duplicate',capability_ref:'cap:cross-filter'}]});
assert.throws(()=>composeToolchestStrips(bad),/DUPLICATE_FUNCTIONALITY:cap:cross-filter/);
console.log(JSON.stringify({schema:'xiio.sdk.toolchest-strips-100s/v1',state:'PASS',cases:100,strips:3,capability_owners:12,duplicate_functionality_hostile:'PASS',effect_authority:0}));
