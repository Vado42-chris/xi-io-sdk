#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeProductSurface, renderProductSurface, bindProductSurface, collectProductSurfaceValues, validateProductSurfaceValues } from '../src/render/product-surface.mjs';

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

const callerVerified = structuredClone(fixture);
callerVerified.statuses = [{ label: 'Qualified', tone: 'verified' }];
callerVerified.sections[0].rows[0].status = { label: 'Current', tone: 'verified' };
const callerVerifiedNormalized = normalizeProductSurface(callerVerified);
assert.deepEqual(callerVerifiedNormalized.statuses[0], { label: 'Qualified (supplied, unverified)', tone: 'unknown' });
assert.deepEqual(callerVerifiedNormalized.sections[0].rows[0].status, { label: 'Current (supplied, unverified)', tone: 'unknown' });
const callerVerifiedHtml = renderProductSurface(callerVerified);
assert.doesNotMatch(callerVerifiedHtml, /data-tone="verified"/);
assert.match(callerVerifiedHtml, /Qualified \(supplied, unverified\)/);
assert.match(callerVerifiedHtml, /Current \(supplied, unverified\)/);

const invalidEnvironment = structuredClone(fixture);
invalidEnvironment.environment = 'PROD';
assert.throws(() => normalizeProductSurface(invalidEnvironment), /environment unsupported/);

const rawWorkRef = structuredClone(fixture);
rawWorkRef.work_ref = 'private-work';
assert.throws(() => normalizeProductSurface(rawWorkRef), /work_ref is forbidden/);

const declaredLive = renderProductSurface({ ...fixture, environment: 'LIVE' });
assert.match(declaredLive, /Declared environment/);
assert.match(declaredLive, /data-tone="unknown">Unverified<\/span>/);
assert.match(declaredLive, /<span>LIVE<\/span>/, 'preserve the host declaration without upgrading its provenance');
const observation = { id: 'observation:public:1', generation: 'generation:1', digest: `sha256:${'a'.repeat(64)}`, observed_at: '2026-09-08T13:00:00.000Z' };
const observed = normalizeProductSurface({ ...fixture, host_observation: observation });
observation.id = 'changed:after:normalize';
assert.equal(observed.host_observation.id, 'observation:public:1', 'copy host observation metadata');
const observationHtml = renderProductSurface(observed);
assert.match(observationHtml, /data-evidence-state="SUPPLIED_UNVERIFIED"/);
assert.match(observationHtml, /Host observation \(unverified\)/);
for (const override of [{ digest: 'mock' }, { observed_at: '2026-02-31T00:00:00.000Z' }, { id: 'https://private.example' }, { generation: 'x'.repeat(129) }, { qualified: true }, { evidence_ref: 'private-owner' }]) {
  assert.throws(() => normalizeProductSurface({ ...fixture, host_observation: { ...observation, ...override } }));
}
for (const change of [{ min: 10, max: 1 }, { step: 0 }, { step: -1 }]) {
  const invalid = structuredClone(fixture); Object.assign(invalid.sections[0].fields[0], change);
  assert.throws(() => normalizeProductSurface(invalid));
}
assert.match(html, /<button[^>]*disabled[^>]*data-xiio-action="measure"[^>]*data-xiio-action-disabled="false"[^>]*data-xiio-action-pending="true"/);

// Explicit DOM contract doubles: exercise callback/validation/cleanup behavior,
// not browser rendering, hosted action admission, or runtime qualification.
class Element {
  constructor(attributes = {}, properties = {}) {
    this.attributes = { ...attributes }; this.listeners = new Set();
    Object.assign(this, { disabled: false, required: false, type: 'text', value: '', checked: false, nativeValid: true, reports: 0 }, properties);
  }
  getAttribute(key) { return Object.hasOwn(this.attributes, key) ? this.attributes[key] : null; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(_event, callback) { this.listeners.add(callback); }
  removeEventListener(_event, callback) { this.listeners.delete(callback); }
  checkValidity() { return this.nativeValid; }
  reportValidity() { this.reports += 1; }
  async click() { for (const callback of this.listeners) await callback(); }
}
function dom(fields = [], buttons = [new Element({ 'data-xiio-action': 'measure', 'data-xiio-action-disabled': 'false', 'data-xiio-action-pending': 'true' }, { disabled: true })]) {
  const result = { textContent: '' };
  return { fields, buttons, result, querySelectorAll(selector) { return selector === '[data-xiio-field]' ? fields : buttons; }, querySelector() { return result; } };
}
const root = dom([new Element({ 'data-xiio-field': 'cost', min: '0', max: '10' }, { type: 'number', value: '3', required: true })]);
let calls = [];
let cleanup = bindProductSurface(root);
assert.equal(root.buttons[0].disabled, true); await root.buttons[0].click(); assert.equal(calls.length, 0);
cleanup();
cleanup = bindProductSurface(root, { onAction: value => calls.push(value) });
assert.equal(root.buttons[0].disabled, false); await root.buttons[0].click();
assert.equal(calls.length, 1); assert.equal(calls[0].actionId, 'measure'); assert.equal(calls[0].values.cost, 3);
for (const value of ['', '-1', '11', 'Infinity', 'NaN']) {
  root.fields[0].value = value; await root.buttons[0].click();
  assert.equal(calls.length, 1, `invalid value ${JSON.stringify(value)} reached host action`);
}
root.fields[0].value = '3'; root.fields[0].nativeValid = false; await root.buttons[0].click();
assert.equal(calls.length, 1, 'native step/type constraint must gate action');
assert.match(root.result.textContent, /invalid fields/); assert(root.fields[0].reports > 0);
root.fields[0].nativeValid = true;
root.fields.push(new Element({ 'data-xiio-field': 'ignored' }, { value: '', required: true, disabled: true, nativeValid: false }));
assert.equal(validateProductSurfaceValues(root).valid, true); assert.equal(Object.hasOwn(collectProductSurfaceValues(root), 'ignored'), false);
await root.buttons[0].click(); assert.equal(calls.length, 2);
assert.equal(root.result.textContent, '', 'clear only the SDK validation message after correction');
const firstCleanup = cleanup;
cleanup = bindProductSurface(root, { onAction: value => calls.push(value) });
firstCleanup(); await root.buttons[0].click(); assert.equal(calls.length, 3, 'rebinding must not duplicate actions or let old cleanup disable new binding');
cleanup(); assert.equal(root.buttons[0].disabled, true); await root.buttons[0].click(); assert.equal(calls.length, 3);
const hostDisabled = dom([], [new Element({ 'data-xiio-action': 'blocked', 'data-xiio-action-disabled': 'true', 'data-xiio-action-pending': 'true' }, { disabled: true })]);
const stopDisabled = bindProductSurface(hostDisabled, { onAction: () => { throw new Error('host-disabled action invoked'); } });
assert.equal(hostDisabled.buttons[0].disabled, true); await hostDisabled.buttons[0].click(); stopDisabled();
const legacyDisabled = dom([], [new Element({ 'data-xiio-action': 'blocked' }, { disabled: true })]);
const stopLegacy = bindProductSurface(legacyDisabled, { onAction: () => { throw new Error('legacy disabled action invoked'); } });
assert.equal(legacyDisabled.buttons[0].disabled, true); stopLegacy();
const disabledAfterBind = dom();
const stopInitial = bindProductSurface(disabledAfterBind, { onAction: () => {} });
disabledAfterBind.buttons[0].disabled = true;
const stopRebind = bindProductSurface(disabledAfterBind, { onAction: () => { throw new Error('host disabled after binding'); } });
assert.equal(disabledAfterBind.buttons[0].disabled, true); stopInitial(); stopRebind();
const checkbox = dom([new Element({ 'data-xiio-field': 'consent' }, { type: 'checkbox', required: true, checked: false })]);
assert.equal(validateProductSurfaceValues(checkbox).valid, false);
checkbox.fields[0].checked = true; assert.equal(validateProductSurfaceValues(checkbox).valid, true);
const requiredText = dom([new Element({ 'data-xiio-field': 'name' }, { required: true, value: '' })]);
assert.equal(validateProductSurfaceValues(requiredText).valid, false);
requiredText.fields[0].value = 'Name'; assert.equal(validateProductSurfaceValues(requiredText).valid, true);
assert.throws(() => bindProductSurface(root, { onAction: true }), /onAction must be a function/);

console.log(JSON.stringify({
  status: 'PASS',
  positive_cases: 1,
  hostile_cases: 13,
  caller_verified_downgraded: true,
  host_observation_and_action_regressions: 'PASS',
  source_dom_contract_tests: true,
  browser_or_runtime_qualification_claim: false,
  semantic_status_preserved: true,
  transport_authority: false,
  management_topology_exposed: false,
  render_on_the_fly_adapter: 'CANDIDATE'
}));
