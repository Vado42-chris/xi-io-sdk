import * as Core from '../components/core.mjs';
import { renderProgressiveDisclosure } from '../components/progressive-disclosure.mjs';

const REQUIRED = ['root', 'work', 'role', 'generation', 'affectedReason', 'next', 'proof', 'returnTo', 'wake'];
const ALLOWED = new Set([...REQUIRED, 'status', 'detailsOpen']);
// This public route receives supplied projection data, not authenticated qualification.
// Positive/verified presentation must come from a qualified higher-level consumer.
const CALLER_SAFE_TONES = new Set(['critical', 'warning', 'unknown']);
const MAX_TEXT = 1200;

export const PROGRESSIVE_ROUTE_FIELDS = Object.freeze([
  'root', 'work', 'role', 'generation', 'next', 'affected-reason', 'proof', 'return', 'wake',
]);

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  if (value.length > MAX_TEXT) throw new TypeError(`${label} exceeds ${MAX_TEXT} characters`);
  return value.trim();
}

function routeField(name, html) {
  if (!PROGRESSIVE_ROUTE_FIELDS.includes(name)) throw new TypeError(`unsupported route field hook: ${name}`);
  // Keep receipt rows as siblings so their first/last-child styling survives
  // stable adopter hooks. The markup comes only from Core.renderReceiptRow.
  return html.replace('<div data-xiui="receipt-row"', `<div data-xiui="receipt-row" data-xiio-route-field="${name}"`);
}

export function normalizeProgressiveRouteCard(model = {}) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) throw new TypeError('route card model must be an object');
  const unknown = Object.keys(model).filter((key) => !ALLOWED.has(key));
  if (unknown.length) throw new TypeError(`route card contains unsupported keys: ${unknown.sort().join(',')}`);
  const out = {};
  for (const key of REQUIRED) out[key] = text(model[key], key);
  if (model.detailsOpen !== undefined && typeof model.detailsOpen !== 'boolean') throw new TypeError('detailsOpen must be boolean');
  const status = model.status ?? { label: 'UNKNOWN', tone: 'unknown' };
  if (!status || typeof status !== 'object' || Array.isArray(status)) throw new TypeError('status must be an object');
  out.status = {
    label: text(status.label, 'status.label'),
    // `verified` is intentionally excluded. This renderer cannot authenticate a
    // caller-supplied qualification/currentness claim, so positive tone fails closed.
    tone: CALLER_SAFE_TONES.has(status.tone) ? status.tone : 'unknown',
  };
  out.detailsOpen = model.detailsOpen === true;
  return out;
}

export function renderProgressiveRouteCard(model) {
  const route = normalizeProgressiveRouteCard(model);
  const status = `<span data-xiio-route-status data-xiio-route-status-qualification="supplied-unverified">${Core.renderStatusBadge(route.status)}</span>`;
  const primary = Core.renderStack({ bodyHtml: [
    routeField('root', Core.renderReceiptRow({ label: 'Root', value: route.root })),
    routeField('work', Core.renderReceiptRow({ label: 'Work', value: route.work, statusHtml: status })),
    routeField('role', Core.renderReceiptRow({ label: 'Role', value: route.role })),
    routeField('generation', Core.renderReceiptRow({ label: 'Generation', value: route.generation })),
  ].join('') });
  const next = Core.renderNextActionStrip({
    label: 'Next action',
    bodyHtml: routeField('next', Core.renderReceiptRow({ label: 'Next', value: route.next })),
  });
  const details = renderProgressiveDisclosure({
    summary: 'Why this route / proof / return',
    label: 'Route details',
    open: route.detailsOpen,
    bodyHtml: Core.renderStack({ bodyHtml: [
      routeField('affected-reason', Core.renderReceiptRow({ label: 'Affected reason', value: route.affectedReason })),
      routeField('proof', Core.renderReceiptRow({ label: 'Proof', value: route.proof })),
      routeField('return', Core.renderReceiptRow({ label: 'Return', value: route.returnTo })),
      routeField('wake', Core.renderReceiptRow({ label: 'Wake', value: route.wake })),
    ].join('') }),
  });
  return Core.renderPanel({
    className: 'xiio-progressive-route-card',
    bodyHtml: Core.renderStack({ bodyHtml: `${primary}${next}${details}` }),
  });
}
