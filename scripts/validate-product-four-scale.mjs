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

// Regression from the original peer source: arbitrary caller proof strings
// produced product and compound closure, even with UNKNOWN generation/binding.
const forged = { state:'PASS', proof_ref:'arbitrary-unverified-caller-text', authenticated:true,
  verified:true, state_qualified:'CURRENT', closure_100:true };
const makeProduct = (observation, extra={}) => ({ source_generation:'UNKNOWN', observed_at:'2026-09-08T11:00:00Z',
  authenticated:true, org_product_100:true, verified_resolved_cells:100, authority_granted:true, provider_effect:true,
  products:[{ product_ref:'product:owner-intent', product_class:'UNKNOWN', repo_refs:[], closure_100:true,
    observations:Object.fromEntries(PRODUCT_BASELINE_CELLS.map(id=>[id,observation])), ...extra }] });
const makeScore = observation => ({ subject_ref:'product:owner-intent', subject_generation:'UNKNOWN',
  authenticated:true, compound_100:true, authority_granted:true, provider_effect:true,
  observations:Object.fromEntries(FOUR_SCALE_LAYERS.map(layer=>[layer,
    Object.fromEntries(FOUR_SCALE_STAGES.map(stage=>[stage,observation]))])) });
const counterfeitProduct = compileProductCapabilityBaseline(makeProduct(forged));
assert.equal(counterfeitProduct.product_denominator,1);
assert.equal(counterfeitProduct.cell_denominator,12);
assert.equal(counterfeitProduct.products[0].product_ref,'product:owner-intent');
assert.deepEqual(counterfeitProduct.products[0].repo_refs,[]);
assert.equal(counterfeitProduct.products[0].classification_state,'UNBOUND');
assert.equal(counterfeitProduct.products[0].repo_binding_state,'UNBOUND');
assert.equal(counterfeitProduct.source_generation_state,'UNBOUND');
assert.equal(counterfeitProduct.supplied_resolved_cells,12);
assert.equal(counterfeitProduct.products[0].next.cell,'VERIFY_SUPPLIED_BASELINE');
const counterfeitScore = compileFourScaleScorecard(makeScore(forged));
assert.equal(counterfeitScore.subject_binding_state,'UNBOUND');
assert.equal(counterfeitScore.supplied_compound_100,true);

// All-N/A remains supplied exemption coverage, never verified evidence.
const allNa = { state:'N_A_WITH_EVIDENCE', proof_ref:'same-arbitrary-reference-for-every-cell' };
const naProduct = compileProductCapabilityBaseline(makeProduct(allNa));
const naScore = compileFourScaleScorecard(makeScore(allNa));
assert(naProduct.products[0].cells.every(cell=>cell.state==='SUPPLIED_UNVERIFIED' && cell.declared_state==='N_A_WITH_EVIDENCE'));
assert(naScore.layers.every(layer=>layer.cells.every(cell=>cell.state==='SUPPLIED_UNVERIFIED')));
assert.equal(naScore.supplied_compound_100,true);

// Invalid observations preserve all cells and cannot inflate supplied coverage.
for (const bad of [null, [], true, 'PASS', {state:'PASS'}, {state:'PASS',proof_ref:{}},
  {state:'PASS',proof_ref:'x'.repeat(513)}, {state:'N_A_WITH_EVIDENCE',proof_ref:' '}, {state:'INVENTED',proof_ref:'x'}]) {
  const product = compileProductCapabilityBaseline(makeProduct(bad));
  const score = compileFourScaleScorecard(makeScore(bad));
  assert.equal(product.cell_denominator,12);
  assert.equal(product.supplied_resolved_cells,0);
  assert(product.products[0].cells.every(cell=>cell.state==='UNKNOWN' && cell.verified===false));
  assert.equal(score.layers.reduce((n,layer)=>n+layer.denominator,0),24);
  assert.equal(score.supplied_compound_100,false);
  assert(score.layers.every(layer=>layer.cells.every(cell=>cell.state==='UNKNOWN' && cell.verified===false)));
}
const absent = compileFourScaleScorecard({subject_ref:'fixture:absent',subject_generation:'g1'});
assert(absent.layers.every(layer=>layer.cells.length===6 && layer.cells.every(cell=>cell.state==='UNKNOWN')));
const waiting = compileFourScaleScorecard(makeScore({state:'WAIT',blocker:'fixture:missing-return'}));
assert(waiting.layers.every(layer=>layer.cells.every(cell=>cell.state==='WAIT')));

// Repeated references are one declaration, not extra evidence or products.
const duplicates = makeProduct(forged,{repo_refs:['repo:a',' repo:a '],capability_family_refs:['cap:b','cap:b']});
const deduped = compileProductCapabilityBaseline(duplicates);
assert.deepEqual(deduped.products[0].repo_refs,['repo:a']);
assert.deepEqual(deduped.products[0].capability_family_refs,['cap:b']);
assert.equal(deduped.product_denominator,1);
const duplicateProducts = makeProduct(forged);
duplicateProducts.products.push({...duplicateProducts.products[0],product_ref:' product:owner-intent '});
assert.throws(()=>compileProductCapabilityBaseline(duplicateProducts),/duplicate product_ref/);
for (const repo_refs of [[{}], 'repo:x', ['x'.repeat(513)], [' ']]) {
  assert.throws(()=>compileProductCapabilityBaseline(makeProduct(forged,{repo_refs})),TypeError);
}
for (const product of [null, [], true]) {
  assert.throws(()=>compileProductCapabilityBaseline({...makeProduct(forged),products:[product]}),TypeError);
}
assert.throws(()=>compileFourScaleScorecard({...makeScore(forged),subject_ref:'x'.repeat(513)}),TypeError);
assert.throws(()=>compileProductCapabilityBaseline({...makeProduct(forged),source_generation:'x'.repeat(513)}),TypeError);

// Preserve the peer's public v1 fields and next-gap semantics, while refusing
// every caller attempt to promote supplied coverage to effects or closure.
for (const result of [products,counterfeitProduct,naProduct,deduped]) {
  assert.equal(result.verified_resolved_cells,0);
  assert.equal(result.products_100,0);
  assert.equal(result.org_product_100,false);
  assert.equal(result.evidence_state,'SUPPLIED_UNVERIFIED');
  assert.equal(result.authority_granted,false);
  assert.equal(result.provider_effect,false);
  assert.equal(result.live_claim,false);
  assert.equal(result.source_currentness,'UNVERIFIED');
  assert(result.products.every(product=>product.resolved===0 && product.closure_100===false
    && product.next!==null && product.evidence_state==='SUPPLIED_UNVERIFIED'));
  assert(result.products.every(product=>product.cells.every(cell=>cell.verified===false)));
}
for (const result of [full,open,invalidPositive,counterfeitScore,naScore,absent,waiting]) {
  assert.equal(result.compound_100,false);
  assert.equal(result.evidence_state,'SUPPLIED_UNVERIFIED');
  assert.equal(result.authority_granted,false);
  assert.equal(result.provider_effect,false);
  assert.equal(result.live_claim,false);
  assert.equal(result.source_currentness,'UNVERIFIED');
  assert.equal(result.supplied_compound_display,result.layers.map(layer=>`${layer.layer}:${layer.supplied_display}`).join(' | '));
  assert(result.layers.every(layer=>layer.resolved===0 && layer.pct===0 && !layer.closure_100 && layer.first_open!==null));
  assert(result.layers.every(layer=>layer.cells.every(cell=>cell.verified===false)));
}
assert.equal(compileProductCapabilityBaseline(makeProduct(forged)).product_baseline_generation,counterfeitProduct.product_baseline_generation);
assert.equal(compileFourScaleScorecard(makeScore(forged)).scorecard_generation,counterfeitScore.scorecard_generation);

console.log(`XIIO_SDK_PRODUCT_FOUR_SCALE PASS source-contract-only products=${products.product_denominator} product_cells=${products.cell_denominator} verified_product_cells=${products.verified_resolved_cells} supplied_product_cells=${products.supplied_resolved_cells} four_scale_cells=${FOUR_SCALE_LAYERS.length*FOUR_SCALE_STAGES.length} supplied_compound100=${full.supplied_compound_100} verified_compound100=${full.compound_100}; fake-proof, all-N_A, caller-flags, unknown-binding, omission and dedup controls passed`);
