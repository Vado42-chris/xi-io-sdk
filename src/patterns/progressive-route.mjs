import * as Core from '../components/core.mjs';
import { renderProgressiveDisclosure } from '../components/progressive-disclosure.mjs';

const REQUIRED = ['root', 'work', 'role', 'generation', 'affectedReason', 'next', 'proof', 'returnTo', 'wake'];
const ALLOWED = new Set([...REQUIRED, 'status', 'detailsOpen']);
const TONES = new Set(['critical', 'warning', 'verified', 'unknown']);
const MAX_TEXT = 1200;

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  if (value.length > MAX_TEXT) throw new TypeError(`${label} exceeds ${MAX_TEXT} characters`);
  return value.trim();
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
    tone: TONES.has(status.tone) ? status.tone : 'unknown',
  };
  out.detailsOpen = model.detailsOpen === true;
  return out;
}

export function renderProgressiveRouteCard(model) {
  const route = normalizeProgressiveRouteCard(model);
  const status = Core.renderStatusBadge(route.status);
  const primary = Core.renderStack({ bodyHtml: [
    Core.renderReceiptRow({ label: 'Root', value: route.root }),
    Core.renderReceiptRow({ label: 'Work', value: route.work, statusHtml: status }),
    Core.renderReceiptRow({ label: 'Role', value: route.role }),
    Core.renderReceiptRow({ label: 'Generation', value: route.generation }),
  ].join('') });
  const next = Core.renderNextActionStrip({
    label: 'Next action',
    bodyHtml: Core.renderReceiptRow({ label: 'Next', value: route.next }),
  });
  const details = renderProgressiveDisclosure({
    summary: 'Why this route / proof / return',
    label: 'Route details',
    open: route.detailsOpen,
    bodyHtml: Core.renderStack({ bodyHtml: [
      Core.renderReceiptRow({ label: 'Affected reason', value: route.affectedReason }),
      Core.renderReceiptRow({ label: 'Proof', value: route.proof }),
      Core.renderReceiptRow({ label: 'Return', value: route.returnTo }),
      Core.renderReceiptRow({ label: 'Wake', value: route.wake }),
    ].join('') }),
  });
  return Core.renderPanel({
    className: 'xiio-progressive-route-card',
    bodyHtml: Core.renderStack({ bodyHtml: `${primary}${next}${details}` }),
  });
}
