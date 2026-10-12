import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductSpine } from './validate-product-spine.mjs';

const catalogue = () => ({ products: Array.from({ length: 29 }, (_, i) => ({
  id: 'product-' + i, name: 'Product ' + i, published: i % 2 === 0
})) });

test('29 valid products qualify, only published products are visible', () => {
  const result = validateProductSpine(catalogue());
  assert.equal(result.ok, true);
  assert.equal(result.visible.length, 15);
  assert.equal(result.publication_authorized, false);
});
test('nine-product legacy catalogue is rejected', () => {
  assert.equal(validateProductSpine({ products: catalogue().products.slice(0, 9) }).first_red, 'PRODUCT_COUNT_MISMATCH');
});
test('missing published flags fail closed', () => {
  const doc = catalogue(); delete doc.products[0].published;
  assert.ok(validateProductSpine(doc).failures.some(x => x.startsWith('PUBLISHED_BOOLEAN_MISSING')));
  assert.equal(validateProductSpine(doc).visible.length, 0);
});
test('duplicate IDs fail closed', () => {
  const doc = catalogue(); doc.products[1].id = doc.products[0].id;
  assert.ok(validateProductSpine(doc).failures.some(x => x.startsWith('PRODUCT_ID_DUPLICATE')));
});
test('invalid catalogue and malformed records are rejected', () => {
  assert.equal(validateProductSpine({}).first_red, 'PRODUCTS_ARRAY_MISSING');
  const doc = catalogue(); doc.products[2] = null;
  assert.ok(validateProductSpine(doc).failures.some(x => x.startsWith('PRODUCT_RECORD_INVALID')));
});
