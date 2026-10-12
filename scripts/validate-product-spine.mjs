#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Task 27: validate canonical product catalogue before any published projection.
 * Read-only. This SDK does not own or mutate the xi-io.net catalogue.
 */
const PUBLIC_IDS = new Set(['studio', 'desktop', 'publisher', 'switchboard', 'bins', 'inbox', 'ibal', 'benchmark', 'wordpress']);
export function validateProductSpine(catalogue, { expectedCount = 29 } = {}) {
  const failures = [];
  const products = Array.isArray(catalogue?.products) ? catalogue.products : null;
  if (!products) return { ok: false, first_red: 'PRODUCTS_ARRAY_MISSING', failures: ['PRODUCTS_ARRAY_MISSING'], visible: [], count: 0 };
  if (products.length !== expectedCount) failures.push('PRODUCT_COUNT_MISMATCH');
  const seen = new Set();
  for (const [index, product] of products.entries()) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      failures.push('PRODUCT_RECORD_INVALID:' + index);
      continue;
    }
    if (typeof product.id !== 'string' || !product.id.trim()) failures.push('PRODUCT_ID_MISSING:' + index);
    else if (seen.has(product.id)) failures.push('PRODUCT_ID_DUPLICATE:' + product.id);
    else seen.add(product.id);
    if (typeof product.name !== 'string' || !product.name.trim()) failures.push('PRODUCT_NAME_MISSING:' + index);
    if (typeof product.published !== 'boolean') failures.push('PUBLISHED_BOOLEAN_MISSING:' + (product.id || index));
  }
  const declaredPublished = products.filter(p => p && p.published === true).map(p => p.id);
  if (declaredPublished.length !== PUBLIC_IDS.size) failures.push('PUBLISHED_COUNT_MISMATCH');
  for (const id of PUBLIC_IDS) if (!declaredPublished.includes(id)) failures.push('REQUIRED_PUBLISHED_ID_MISSING:' + id);
  for (const id of declaredPublished) if (!PUBLIC_IDS.has(id)) failures.push('UNAUTHORIZED_PUBLISHED_ID:' + id);
  const visible = failures.length ? [] : products.filter(product => product.published === true);
  return {
    schema: 'xiio.product-spine-qualification/v1',
    ok: failures.length === 0,
    first_red: failures[0] || null,
    failures,
    count: products.length,
    visible,
    effect_authority: 0,
    publication_authorized: false,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error(JSON.stringify({ ok: false, first_red: 'CATALOGUE_PATH_REQUIRED' }));
    process.exitCode = 2;
  } else {
    try {
      const result = validateProductSpine(JSON.parse(fs.readFileSync(file, 'utf8')));
      console.log(JSON.stringify({ ...result, visible: result.visible.map(p => p.id) }, null, 2));
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({ ok: false, first_red: 'CATALOGUE_READ_OR_PARSE_FAILED', detail: String(error.message) }));
      process.exitCode = 2;
    }
  }
}
