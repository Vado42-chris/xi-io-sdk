import assert from 'node:assert/strict';
import { compileProductCapabilityBaseline, PRODUCT_BASELINE_CELLS } from '../src/baseline/product-capability.mjs';
import { compileFourScaleScorecard, FOUR_SCALE_LAYERS, FOUR_SCALE_STAGES } from '../src/scorecards/four-scale.mjs';

const proof = (id) => ({ state:'PASS', proof_ref:`receipt:${id}` });
const allProduct = Object.fromEntries(PRODUCT_BASELINE_CELLS.map(id=>[id,proof(id)]));
const products = compileProductCapabilityBaseline({
  source_generation:'fixture:products:g1', observed_at:'2026-09-08T11:00:00Z', products:[
    { product_ref:'product:ready', product_class:'PRODUCT', repo_refs:['repo:ready'], observations:allProduct },
    { product_ref:'product:comment-stew', product_class:'UNKNOWN', repo_refs:[], observations:{ REGISTRATION:proof('registration') } },
    { product_ref:'product:bad-positive', product_class:'PRODUCT', repo_refs:['repo:x'], observations:{ REGISTRATION:{state:'PASS'} } },
  ],
});
assert.equal(products.product_denominator,3);
assert.equal(products.cell_denominator,36);
assert.equal(products.products_100,0);
assert.equal(products.products_not_100,3);
assert.equal(products.org_product_100,false);
assert.equal(products.verified_resolved_cells,0);
assert.equal(products.supplied_resolved_cells,13);
assert.equal(products.products.find(p=>p.product_ref==='product:ready').supplied_coverage_100,true);
assert.equal(products.products.find(p=>p.product_ref==='product:ready').closure_100,false);
assert.equal(products.products.find(p=>p.product_ref==='product:ready').next.cell,'VERIFY_SUPPLIED_BASELINE');
assert.equal(products.products.find(p=>p.product_ref==='product:comment-stew').next.cell,'PRODUCT_CLASSIFICATION');
assert.equal(products.products.find(p=>p.product_ref==='product:bad-positive').cells[0].state,'UNKNOWN');

const allFour = Object.fromEntries(FOUR_SCALE_LAYERS.map(layer=>[
  layer,Object.fromEntries(FOUR_SCALE_STAGES.map(stage=>[stage,proof(`${layer}:${stage}`)])),
]));
const full = compileFourScaleScorecard({ subject_ref:'subject:1', subject_generation:'g1', observations:allFour });
assert.equal(full.compound_100,false);
assert.equal(full.supplied_compound_100,true);
assert(full.layers.every(layer=>layer.display==='0/6' && layer.supplied_display==='6/6' && layer.pct===0 && layer.supplied_pct===100));
assert(full.layers.every(layer=>layer.first_open.stage==='VERIFY_SUPPLIED_LAYER'));
const partial = structuredClone(allFour);
delete partial.META.AFFECTED_RETURN_CURRENT;
const open = compileFourScaleScorecard({ subject_ref:'subject:1', subject_generation:'g2', observations:partial });
assert.equal(open.compound_100,false);
assert.equal(open.supplied_compound_100,false);
assert.equal(open.layers.find(l=>l.layer==='META').display,'0/6');
assert.equal(open.layers.find(l=>l.layer==='META').supplied_display,'5/6');
assert.equal(open.layers.find(l=>l.layer==='META').first_open.stage,'AFFECTED_RETURN_CURRENT');
partial.MICRO.CHANGE_MATERIALIZED={state:'PASS'};
const invalidPositive = compileFourScaleScorecard({ subject_ref:'subject:2', subject_generation:'g1', observations:partial });
assert.equal(invalidPositive.layers.find(l=>l.layer==='MICRO').cells[0].state,'UNKNOWN');

console.log(`XIIO_SDK_PRODUCT_FOUR_SCALE PASS products=${products.product_denominator} product_cells=${products.cell_denominator} verified_product_cells=${products.verified_resolved_cells} supplied_product_cells=${products.supplied_resolved_cells} four_scale_cells=${FOUR_SCALE_LAYERS.length*FOUR_SCALE_STAGES.length} supplied_compound100=${full.supplied_compound_100} verified_compound100=${full.compound_100}`);
