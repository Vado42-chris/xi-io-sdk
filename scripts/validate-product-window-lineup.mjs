import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileProductWindowRegistry, compileProductWindowSession, stampAllProducts } from '../src/product-window/registry.mjs';
import { productWindowProductStage } from '../src/product-window/contract.mjs';
const product_catalog=[
  {studio_product_id:'app_a',product_ref:'product:a',label:'App A',family:'GAME'},
  {studio_product_id:'app_b',product_ref:'product:b',label:'App B',family:'LEGAL'},
];
const donor=JSON.parse(readFileSync(new URL('../standards/product-window-lineup.v1.json',import.meta.url),'utf8'));
assert.equal(donor.status,'HISTORICAL_DONOR_SNAPSHOT_NOT_CURRENT');
assert.match(donor.consumption_rule,/NO_RUNTIME_LINEUP/);
function fixture(members=['app_a','app_b'],complete=true){
  const denominator={schema:'xiio.studio-product-denominator/v1',id:'studio-root',generation:'g1',
    categories:{studio_member_known:members,studio_membership_unknown_drift:[]},
    counts:{studio_member_known:members.length,studio_membership_denominator:members.length}};
  const graph={schema:'xiio.studio-relationship-graph/v1',root_ref:'studio-root',generation:'g2',
    complete,product_nodes:members.map(id=>({id,membership:'MEMBER'})),unresolved_candidate_nodes:[]};
  return {denominator,relationship_graph:graph,denominator_source_ref:'studio:denominator:g1',
    graph_source_ref:'studio:graph:g2'};
}
const options={studio_registry:fixture(),product_catalog};
const launch_surfaces=['surface:local','surface:browser'];
const compiled=compileProductWindowRegistry(options);
assert.equal(compiled.products.length,2);
assert.equal(compiled.state,'SUPPLIED_UNVERIFIED');
assert.equal(compiled.effect_authority,0);
assert.equal(stampAllProducts(options).length,2);
assert.deepEqual(stampAllProducts(options)[0].frame_controls,['MINIMIZE','MAXIMIZE_RESTORE','CLOSE']);
const session=compileProductWindowSession({product_ref:'product:a',launch_surfaces,...options});
assert.equal(session.stage,'INTERMEDIARY');
assert.equal(session.launch_surface,'surface:local');
assert.deepEqual(session.launch_surfaces,launch_surfaces);
assert.equal(session.product.intermediary_template,'XIIO_WHITE_LABEL_INTERMEDIARY');
assert.doesNotMatch(JSON.stringify(session),/SAM_LAW|sam-law/i);
const body=productWindowProductStage({product_ref:'product:a',project_ref:'p',chat_ref:'c',
  body_ref:'body',...options});
assert.equal(body.stage,'PRODUCT_BODY');
assert.equal(body.project_management,'SUPPLIED_UNVERIFIED');
assert.equal(body.chat,'SUPPLIED_UNVERIFIED');
assert.equal(body.authority.body_mounted,false);
assert.equal(body.authority.effect_authority,0);
assert.throws(()=>compileProductWindowRegistry(),/STUDIO_REGISTRY_UNBOUND/);
assert.throws(()=>compileProductWindowRegistry({...options,product_catalog:[...product_catalog,product_catalog[0]]}),/DUPLICATE/);
assert.throws(()=>compileProductWindowRegistry({...options,product_catalog:[{...product_catalog[0],studio_product_id:'invented'}]}),/NOT_STUDIO_MEMBER/);
assert.throws(()=>compileProductWindowSession({product_ref:'product:unknown',launch_surfaces,...options}),/NOT_STAMPED/);
assert.throws(()=>compileProductWindowSession({product_ref:'product:a',...options}),/SURFACES_UNBOUND/);
assert.throws(()=>compileProductWindowSession({product_ref:'product:a',launch_surface:'surface:foreign',launch_surfaces,...options}),/SURFACE_INVALID/);
assert.throws(()=>compileProductWindowSession({product_ref:'product:a',launch_surfaces:['surface:a','surface:a'],...options}),/SURFACES_DUPLICATE/);
assert.equal(compileProductWindowSession({product_ref:'product:a',launch_surface:'surface:browser',launch_surfaces,...options}).launch_surface,'surface:browser');
const partial=compileProductWindowRegistry({studio_registry:fixture(['app_a','app_b','app_c'],false),product_catalog});
assert.equal(partial.state,'PARTIAL_UNVERIFIED');
assert.deepEqual(partial.missing_member_ids,['app_c']);
const expanded=compileProductWindowRegistry({studio_registry:fixture(['app_a','app_b','app_c']),
  product_catalog:[...product_catalog,{studio_product_id:'app_c',product_ref:'product:c',label:'App C',family:'NEW'}]});
assert.equal(expanded.products.length,3);
assert.equal(expanded.state,'SUPPLIED_UNVERIFIED');
let accessorEffects=0;
const hostileCatalog=[...product_catalog];
Object.defineProperty(hostileCatalog[0],'label',{enumerable:true,get(){accessorEffects++;return 'forged';}});
assert.throws(()=>compileProductWindowRegistry({studio_registry:fixture(),product_catalog:hostileCatalog}),/ACCESSOR_REFUSED/);
const hostileInput={product_catalog,studio_registry:fixture()};
Object.defineProperty(hostileInput,'product_catalog',{enumerable:true,get(){accessorEffects++;return product_catalog;}});
assert.throws(()=>compileProductWindowRegistry(hostileInput),/ACCESSOR_REFUSED/);
assert.equal(accessorEffects,0);
console.log('product-window-studio-registry: PASS');
