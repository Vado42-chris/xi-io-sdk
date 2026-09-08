function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cls(value) {
  const text = String(value ?? '').trim();
  return text ? ` class="${escapeHtml(text)}"` : '';
}

export function renderProgressiveDisclosure({
  summary = '',
  bodyHtml = '',
  open = false,
  className = '',
  label = '',
} = {}) {
  const resolvedSummary = String(summary ?? '').trim();
  if (!resolvedSummary) throw new TypeError('progressive disclosure summary is required');
  if (typeof open !== 'boolean') throw new TypeError('progressive disclosure open must be boolean');
  return `<details data-xiui="progressive-disclosure"${open ? ' open' : ''}${cls(className)}${label ? ` aria-label="${escapeHtml(label)}"` : ''}><summary>${escapeHtml(resolvedSummary)}</summary><div data-xiui-disclosure-body>${bodyHtml}</div></details>`;
}
