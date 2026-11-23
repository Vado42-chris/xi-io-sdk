import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileProductWindowRegistry, compileProductWindowSession, stampAllProducts } from '../src/product-window/registry.mjs';
import { productWindowProductStage, productWindowPublisherDeliveryStage } from '../src/product-window/contract.mjs';
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
  body_ref:'body',launch_surfaces,...options});
assert.equal(body.stage,'PRODUCT_BODY');
assert.equal(body.launch_surface,'surface:local');
assert.deepEqual(body.launch_surfaces,launch_surfaces);
assert.equal(body.project_management,'SUPPLIED_UNVERIFIED');
assert.equal(body.chat,'SUPPLIED_UNVERIFIED');
assert.equal(body.authority.body_mounted,false);
assert.equal(body.authority.effect_authority,0);

// Shape captured from the current Publisher TemplateRecipe contract. SDK does
// not certify Publisher readiness; it only preserves supplied identities.
const publisherRecipe={
  schema:'xiio.publisher.template-recipe/v1',
  recipe_id:'publisher:recipe:app-a',
  generation:'P1',
  product_ref:'product:a',
  sdk_generation:'SDK1',
  ready:true,
  composition:[
    {order:1,component_ref:'sdk:frame',uuid:'uuid-frame',specifier:'@xi-io/sdk/frame',role:'APP_SHELL',invariant:true},
    {order:2,component_ref:'sdk:header',uuid:'uuid-header',specifier:'@xi-io/sdk/header',role:'PAGE_HEADER',invariant:true},
    {order:3,component_ref:'sdk:status',uuid:'uuid-status',specifier:'@xi-io/sdk/status',role:'STATUS',invariant:true},
    {order:4,component_ref:'sdk:action',uuid:'uuid-action',specifier:'@xi-io/sdk/action',role:'ACTION',invariant:true},
  ],
  variants:{accent_token:'brand:accent-primary'},
  brand_binding:{ref:'brand:app-a',generation:'B1',evidence_ref:'brand:evidence:B1',owner_ref:'brand:owner'},
};
const deliverySdkRegistry={
  'sdk:frame':{uuid:'uuid-frame',specifier:'@xi-io/sdk/frame',generation:'SDK1',interactions:['inspect']},
  'sdk:header':{uuid:'uuid-header',specifier:'@xi-io/sdk/header',generation:'SDK1',interactions:['inspect']},
  'sdk:status':{uuid:'uuid-status',specifier:'@xi-io/sdk/status',generation:'SDK1',interactions:['inspect']},
  'sdk:action':{uuid:'uuid-action',specifier:'@xi-io/sdk/action',generation:'SDK1',interactions:['invoke','inspect']},
};
const delivery=productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',
  launch_surface:'surface:browser',launch_surfaces,
  publisher_recipe:publisherRecipe,sdk_registry:deliverySdkRegistry,...options
});
assert.equal(delivery.schema,'xiio.product-window-delivery/v1');
assert.equal(delivery.product.product_ref,'product:a');
assert.equal(delivery.publisher.product_ref,'product:a');
assert.equal(delivery.publisher.recipe_ref,'publisher:recipe:app-a');
assert.equal(delivery.publisher.recipe_generation,'P1');
assert.equal(delivery.publisher.sdk_generation,'SDK1');
assert.equal(delivery.publisher.declared_ready,true);
assert.equal(delivery.publisher.qualification,'UNVERIFIED');
assert.deepEqual(delivery.publisher.component_refs,['sdk:frame','sdk:header','sdk:status','sdk:action']);
assert.equal(delivery.publisher.components[3].uuid,'uuid-action');
assert.equal(delivery.publisher.chroma.accent_token,'brand:accent-primary');
assert.equal(delivery.publisher.chroma.brand_ref,'brand:app-a');
assert.equal(delivery.publisher.chroma.brand_generation,'B1');
assert.equal(delivery.delivery.renderer,'BROWSER_CAPABLE_WINDOW');
assert.equal(delivery.authority.effect_authority,0);
assert.equal(delivery.authority.publisher_recipe_authority,false);

assert.throws(()=>productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:{...publisherRecipe,product_ref:'product:b'},sdk_registry:deliverySdkRegistry,...options
}),/PUBLISHER_PRODUCT_MISMATCH/);

const declaredNotReady=productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:{...publisherRecipe,ready:false},sdk_registry:deliverySdkRegistry,...options
});
assert.equal(declaredNotReady.publisher.state,'DECLARED_NOT_READY');
assert.equal(declaredNotReady.publisher.qualification,'UNVERIFIED');

const unknownRoleRecipe={
  ...publisherRecipe,
  composition:publisherRecipe.composition.map((part,index)=>index===1?{...part,role:'FUTURE_PUBLISHER_ROLE'}:part),
};
const unknownRoleDelivery=productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:unknownRoleRecipe,sdk_registry:deliverySdkRegistry,...options
});
assert.equal(unknownRoleDelivery.publisher.qualification,'UNVERIFIED');
assert.equal(unknownRoleDelivery.publisher.components[1].role,'FUTURE_PUBLISHER_ROLE');

assert.throws(()=>productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:publisherRecipe,
  sdk_registry:{...deliverySdkRegistry,'sdk:action':{...deliverySdkRegistry['sdk:action'],uuid:'uuid-substituted'}},
  ...options
}),/SDK_COMPONENT_BINDING_UNVERIFIED/);

assert.throws(()=>productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:publisherRecipe,
  sdk_registry:{...deliverySdkRegistry,'sdk:frame':{...deliverySdkRegistry['sdk:frame'],generation:'SDK0'}},
  ...options
}),/SDK_COMPONENT_BINDING_UNVERIFIED/);

assert.throws(()=>productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:{...publisherRecipe,brand_binding:null},sdk_registry:deliverySdkRegistry,...options
}),/BRAND_BINDING_REQUIRED/);

assert.throws(()=>productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:publisherRecipe,
  sdk_registry:{...deliverySdkRegistry,'sdk:action':{...deliverySdkRegistry['sdk:action'],interactions:['invoke','   ']}},
  ...options
}),/SDK_INTERACTION_CONTRACT_MISSING/);

let deliveryAccessorEffects=0;
const hostileDelivery={
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',
  launch_surfaces,publisher_recipe:publisherRecipe,sdk_registry:deliverySdkRegistry,...options
};
Object.defineProperty(hostileDelivery,'publisher_recipe',{enumerable:true,get(){deliveryAccessorEffects++;return publisherRecipe;}});
assert.throws(()=>productWindowPublisherDeliveryStage(hostileDelivery),/DELIVERY_INPUT_INVALID/);
assert.equal(deliveryAccessorEffects,0);

const hostilePublisherRecipe={...publisherRecipe};
Object.defineProperty(hostilePublisherRecipe,'composition',{enumerable:true,get(){deliveryAccessorEffects++;return publisherRecipe.composition;}});
assert.throws(()=>productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:hostilePublisherRecipe,sdk_registry:deliverySdkRegistry,...options
}),/PUBLISHER_COMPOSITION_REQUIRED/);
assert.equal(deliveryAccessorEffects,0);

const sparseComposition=[publisherRecipe.composition[0],,publisherRecipe.composition[2],publisherRecipe.composition[3]];
assert.throws(()=>productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:{...publisherRecipe,composition:sparseComposition},sdk_registry:deliverySdkRegistry,...options
}),/PUBLISHER_COMPOSITION_REQUIRED/);

const interactionGetterRegistry={...deliverySdkRegistry,'sdk:action':{...deliverySdkRegistry['sdk:action']}};
const hostileInteractions=['invoke','inspect'];
Object.defineProperty(hostileInteractions,'1',{enumerable:true,get(){deliveryAccessorEffects++;return 'inspect';}});
interactionGetterRegistry['sdk:action'].interactions=hostileInteractions;
assert.throws(()=>productWindowPublisherDeliveryStage({
  product_ref:'product:a',project_ref:'p',chat_ref:'c',body_ref:'body',launch_surfaces,
  publisher_recipe:publisherRecipe,sdk_registry:interactionGetterRegistry,...options
}),/SDK_INTERACTION_CONTRACT_MISSING/);
assert.equal(deliveryAccessorEffects,0);
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
