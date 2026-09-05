#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeProductSurface, renderProductSurface } from '../src/render/product-surface.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/product-surface/interaction-cost.synthetic.json', import.meta.url), 'utf8'));
const normalized = normalizeProductSurface(fixture);
const html = renderProductSurface(fixture);

assert.equal(normalized.schema, 'xiio.sdk.product-surface/v1');
assert.equal(normalized.environment, 'TEST');
assert.equal(normalized.sections.length, 3);
assert.equal(normalized.actions.length, 1);
assert.match(html, /data-xiui="page-shell"/);
assert.match(html, /data-xiio-field="baseline-human"/);
assert.match(html, /data-xiio-action="measure"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /data-tone="unknown">WAIT<\/span>/, 'row status must survive render contraction');
assert.ok(!html.includes('<script'));
assert.ok(!html.includes('xi-io.net#'));
assert.ok(!html.includes('evidence_ref'));

const injection = structuredClone(fixture);
injection.title = '<img src=x onerror=alert(1)>';
const injectionHtml = renderProductSurface(injection);
assert.ok(!injectionHtml.includes('<img src=x'));
assert.ok(injectionHtml.includes('&lt;img'));

const authorityLeak = structuredClone(fixture);
authorityLeak.authority = 'release';
assert.throws(() => normalizeProductSurface(authorityLeak), /authority is forbidden/);

const evidenceLeak = structuredClone(fixture);
evidenceLeak.sections[0].evidence_ref = 'private-owner#123';
assert.throws(() => normalizeProductSurface(evidenceLeak), /evidence_ref is forbidden/);

const rawHtmlLeak = structuredClone(fixture);
rawHtmlLeak.sections[0].body_html = '<b>unsafe</b>';
assert.throws(() => normalizeProductSurface(rawHtmlLeak), /body_html is forbidden/);

const endpointLeak = structuredClone(fixture);
endpointLeak.endpoint = 'https://private.example';
assert.throws(() => normalizeProductSurface(endpointLeak), /endpoint is forbidden/);

const duplicateField = structuredClone(fixture);
duplicateField.sections[1].fields[0].id = duplicateField.sections[0].fields[0].id;
assert.throws(() => normalizeProductSurface(duplicateField), /duplicate section\/field\/action identity/);

const duplicateAction = structuredClone(fixture);
duplicateAction.actions.push(structuredClone(duplicateAction.actions[0]));
assert.throws(() => normalizeProductSurface(duplicateAction), /duplicate section\/field\/action identity/);

const unknownField = structuredClone(fixture);
unknownField.sections[0].fields[0].semantic_state = 'PASS';
assert.throws(() => normalizeProductSurface(unknownField), /unsupported keys/);

const oversized = structuredClone(fixture);
oversized.sections = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: `Section ${i}`, fields: [], rows: [] }));
assert.throws(() => normalizeProductSurface(oversized), /bounded non-empty array/);

const badTone = structuredClone(fixture);
badTone.statuses[0].tone = 'success';
assert.throws(() => normalizeProductSurface(badTone), /tone unsupported/);

const invalidEnvironment = structuredClone(fixture);
invalidEnvironment.environment = 'PROD';
assert.throws(() => normalizeProductSurface(invalidEnvironment), /environment unsupported/);

const rawWorkRef = structuredClone(fixture);
rawWorkRef.work_ref = 'private-work';
assert.throws(() => normalizeProductSurface(rawWorkRef), /work_ref is forbidden/);

console.log(JSON.stringify({
  status: 'PASS',
  positive_cases: 1,
  hostile_cases: 12,
  semantic_status_preserved: true,
  transport_authority: false,
  management_topology_exposed: false,
  render_on_the_fly_adapter: 'CANDIDATE'
}));
