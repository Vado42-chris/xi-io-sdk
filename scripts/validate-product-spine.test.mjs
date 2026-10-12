import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductSpine } from './validate-product-spine.mjs';

const publicIds = ['studio','desktop','publisher','switchboard','bins','inbox','ibal','benchmark','wordpress'];
const catalogue = () => ({ products: Array.from({ length: 29 }, (_, i) => ({
  id: publicIds[i] || 'product-' + i, name: 'Product ' + i, published: i < 9
})) });

test('29 valid products qualify, only published products are visible', () => {
  const result = validateProductSpine(catalogue());
  assert.equal(result.ok, true);
  assert.equal(result.visible.length, 9);
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

test('unapproved tenth published product fails closed', () => {
 const doc = catalogue(); doc.products[9].published = true;
 const result = validateProductSpine(doc);
 assert.equal(result.ok, false);
 assert.ok(result.failures.includes('UNAUTHORIZED_PUBLISHED_ID:product-9'));
 assert.equal(result.visible.length, 0);
});
test('missing one of the nine required published identities fails closed', () => {
 const doc = catalogue(); doc.products[0].published = false;
 const result = validateProductSpine(doc);
 assert.equal(result.ok, false);
 assert.ok(result.failures.includes('REQUIRED_PUBLISHED_ID_MISSING:studio'));
});
test('replacing required public identity with another fails closed', () => {
 const doc = catalogue(); doc.products[0].id = 'other-studio';
 const result = validateProductSpine(doc);
 assert.equal(result.ok, false);
 assert.ok(result.failures.includes('REQUIRED_PUBLISHED_ID_MISSING:studio'));
});
