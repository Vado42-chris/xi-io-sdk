#!/usr/bin/env node
import assert from 'node:assert/strict';
import { renderProgressiveDisclosure } from '../src/components/progressive-disclosure.mjs';
import { normalizeProgressiveRouteCard, renderProgressiveRouteCard } from '../src/patterns/progressive-route.mjs';

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
const html = renderProgressiveRouteCard({ ...fixture, work: '<script>alert(1)</script>' });
assert(html.includes('data-xiui="panel"'));
assert(html.includes('data-xiui="next-action-strip"'));
assert(html.includes('data-xiui="progressive-disclosure"'));
assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(!html.includes('<script>alert(1)</script>'));
assert(html.includes('Safe Resource Recovery') === false);
assert(html.includes('Why this route / proof / return'));
assert(html.includes('SIMULATED'));
assert.throws(() => normalizeProgressiveRouteCard({ ...fixture, proof: '' }), /proof must be a non-empty string/);
assert.throws(() => normalizeProgressiveRouteCard({ ...fixture, extra: 'nope' }), /unsupported keys/);
assert.throws(() => normalizeProgressiveRouteCard({ ...fixture, detailsOpen: 'yes' }), /detailsOpen must be boolean/);

console.log('XIIO_SDK_PROGRESSIVE_ROUTE PASS primitive=progressive-disclosure pattern=progressive-route-card owner_authority=0');
