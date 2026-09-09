#!/usr/bin/env node
import assert from 'node:assert/strict';
import { renderProgressiveDisclosure } from '../src/components/progressive-disclosure.mjs';
import { PROGRESSIVE_ROUTE_FIELDS, normalizeProgressiveRouteCard, renderProgressiveRouteCard } from '../src/patterns/progressive-route.mjs';

const collapsed = renderProgressiveDisclosure({
  summary: '<More>',
  bodyHtml: '<p>trusted fixture</p>',
  label: 'Details "safe"',
});
assert(collapsed.includes('data-xiui="progressive-disclosure"'));
assert(collapsed.includes('&lt;More&gt;'));
assert(collapsed.includes('aria-label="Details &quot;safe&quot;"'));
assert(!collapsed.includes('<details data-xiui="progressive-disclosure" open'));
assert.throws(() => renderProgressiveDisclosure({ summary: '' }), /summary is required/);
assert.throws(() => renderProgressiveDisclosure({ summary: 'x', open: 'yes' }), /open must be boolean/);

const fixture = {
  root: 'UTR-DEMO-001',
  work: 'Safe Resource Recovery',
  role: 'Ibal learner',
  generation: 'candidate:abc123',
  affectedReason: 'Current worker needs one bounded route, not the whole backlog.',
  next: 'Resolve the current resource and read or reject it safely.',
  proof: 'Typed readback with owner relay = 0',
  returnTo: 'parent ACK/RCP',
  wake: 'resource generation moves or proof arrives',
  status: { label: 'SIMULATED', tone: 'warning' },
};
const normalized = normalizeProgressiveRouteCard(fixture);
assert.equal(normalized.detailsOpen, false);
assert.equal(normalized.status.tone, 'warning');

// Caller-supplied positive status must never mint a verified presentation state.
const forgedVerified = normalizeProgressiveRouteCard({ ...fixture, status: { label: 'CURRENT', tone: 'verified' } });
assert.equal(forgedVerified.status.label, 'CURRENT');
assert.equal(forgedVerified.status.tone, 'unknown');
const forgedHtml = renderProgressiveRouteCard({ ...fixture, status: { label: 'CURRENT', tone: 'verified' } });
assert(forgedHtml.includes('data-xiio-route-status-qualification="supplied-unverified"'));
assert(!forgedHtml.includes('xiui-status-badge--verified'));

const html = renderProgressiveRouteCard({ ...fixture, work: '<script>alert(1)</script>' });
assert(html.includes('data-xiui="panel"'));
assert(html.includes('data-xiui="next-action-strip"'));
assert(html.includes('data-xiui="progressive-disclosure"'));
assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(!html.includes('<script>alert(1)</script>'));
assert(html.includes('Safe Resource Recovery') === false);
assert(html.includes('Why this route / proof / return'));
assert(html.includes('SIMULATED'));
for (const field of PROGRESSIVE_ROUTE_FIELDS) {
  assert(html.includes(`data-xiio-route-field="${field}"`), `missing stable adopter hook ${field}`);
  assert.equal(html.split(`data-xiio-route-field="${field}"`).length - 1, 1, `duplicate stable adopter hook ${field}`);
  assert(html.includes(`data-xiui="receipt-row" data-xiio-route-field="${field}"`), `hook ${field} must stay on the receipt row, preserving sibling CSS selectors`);
}
assert(!html.includes('<div data-xiio-route-field='), 'route hooks must not insert wrappers between receipt-row siblings');
assert.equal(new Set(PROGRESSIVE_ROUTE_FIELDS).size, PROGRESSIVE_ROUTE_FIELDS.length, 'route hook names must be unique');
assert(html.includes('data-xiio-route-status'), 'status hook missing');
for (const forbidden of ['data-xiio-route-authority', 'data-xiio-route-currentness', 'data-xiio-route-effect']) {
  assert(!html.includes(forbidden), `${forbidden} must not be minted by presentation hooks`);
}
assert.throws(() => normalizeProgressiveRouteCard({ ...fixture, proof: '' }), /proof must be a non-empty string/);
assert.throws(() => normalizeProgressiveRouteCard({ ...fixture, extra: 'nope' }), /unsupported keys/);
assert.throws(() => normalizeProgressiveRouteCard({ ...fixture, detailsOpen: 'yes' }), /detailsOpen must be boolean/);

console.log(`XIIO_SDK_PROGRESSIVE_ROUTE PASS primitive=progressive-disclosure pattern=progressive-route-card hooks=${PROGRESSIVE_ROUTE_FIELDS.length} caller_verified_blocked=1 owner_authority=0`);
