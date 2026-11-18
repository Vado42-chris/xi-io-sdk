import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PRODUCT_BASELINE_CONTRACT,
  PRODUCT_BASELINE_CELLS,
  PRODUCT_BASELINE_INPUT_STATES,
  PRODUCT_BASELINE_POSITIVE_STATES,
} from '../src/baseline/product-capability.mjs';

test('product baseline denominators come from one versioned SDK contract',()=>{
  assert.equal(PRODUCT_BASELINE_CONTRACT.schema,'xiio.sdk.product-capability-baseline-contract/v1');
  assert.equal(PRODUCT_BASELINE_CONTRACT.version,1);
  assert.deepEqual(PRODUCT_BASELINE_CELLS,PRODUCT_BASELINE_CONTRACT.cells);
  assert.deepEqual(PRODUCT_BASELINE_INPUT_STATES,PRODUCT_BASELINE_CONTRACT.observation_states);
  assert.deepEqual(PRODUCT_BASELINE_POSITIVE_STATES,PRODUCT_BASELINE_CONTRACT.positive_states);
  assert.equal(new Set(PRODUCT_BASELINE_CELLS).size,PRODUCT_BASELINE_CELLS.length);
  assert.equal(new Set(PRODUCT_BASELINE_INPUT_STATES).size,PRODUCT_BASELINE_INPUT_STATES.length);
  assert.equal(new Set(PRODUCT_BASELINE_POSITIVE_STATES).size,PRODUCT_BASELINE_POSITIVE_STATES.length);
  for(const state of PRODUCT_BASELINE_POSITIVE_STATES)
    assert.ok(PRODUCT_BASELINE_INPUT_STATES.includes(state));
});

test('compiler source contains no hand-maintained baseline cell/state denominator',()=>{
  const source=fs.readFileSync(new URL('../src/baseline/product-capability.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/PRODUCT_BASELINE_CELLS\s*=\s*Object\.freeze\(\[/);
  assert.doesNotMatch(source,/new Set\(\['PASS','PARTIAL','BLOCKED','UNKNOWN'/);
  assert.match(source,/product-capability-contract\.v1\.json/);
});
