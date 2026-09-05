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

export function renderPageShell({ bodyHtml = '', className = '' } = {}) {
  return `<div data-xiui-root data-xiui="page-shell"${cls(className)}>${bodyHtml}</div>`;
}

export function renderSection({ bodyHtml = '', className = '', label = '' } = {}) {
  return `<section data-xiui="section"${cls(className)}${label ? ` aria-label="${escapeHtml(label)}"` : ''}>${bodyHtml}</section>`;
}

export function renderPanel({ bodyHtml = '', className = '' } = {}) {
  return `<div data-xiui="panel"${cls(className)}>${bodyHtml}</div>`;
}

export function renderGrid({ bodyHtml = '', className = '' } = {}) {
  return `<div data-xiui="grid"${cls(className)}>${bodyHtml}</div>`;
}

export function renderStack({ bodyHtml = '', className = '' } = {}) {
  return `<div data-xiui="stack"${cls(className)}>${bodyHtml}</div>`;
}

export function renderStatusBadge({ label = '', tone = 'unknown', className = '' } = {}) {
  const allowed = new Set(['critical', 'warning', 'verified', 'unknown']);
  const resolvedTone = allowed.has(tone) ? tone : 'unknown';
  return `<span data-xiui="status-badge" data-tone="${resolvedTone}"${cls(className)}>${escapeHtml(label)}</span>`;
}

export function renderActionButton({ label = '', disabled = false, className = '', attributes = '' } = {}) {
  return `<button type="button" data-xiui="action-button"${cls(className)}${disabled ? ' disabled aria-disabled="true"' : ''}${attributes ? ` ${attributes}` : ''}>${escapeHtml(label)}</button>`;
}

export function renderEvidencePanel({ rows = [], className = '', title = '' } = {}) {
  const body = (Array.isArray(rows) ? rows : []).map((row) => `<dt>${escapeHtml(row?.label ?? '')}</dt><dd>${escapeHtml(row?.value ?? '')}</dd>`).join('');
  return `<section data-xiui="evidence-panel"${cls(className)}${title ? ` aria-label="${escapeHtml(title)}"` : ''}><dl>${body}</dl></section>`;
}

export function renderContextInspector({ bodyHtml = '', className = '', label = 'Context inspector' } = {}) {
  return `<aside data-xiui="context-inspector"${cls(className)} aria-label="${escapeHtml(label)}">${bodyHtml}</aside>`;
}

export function renderReceiptRow({ label = '', value = '', statusHtml = '', className = '' } = {}) {
  return `<div data-xiui="receipt-row"${cls(className)}><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span>${statusHtml}</div>`;
}

export function renderConfirmationDialog({ id = '', title = '', bodyHtml = '', primaryLabel = 'Confirm', cancelLabel = 'Cancel', className = '' } = {}) {
  return `<dialog data-xiui="confirmation-dialog"${id ? ` id="${escapeHtml(id)}"` : ''}${cls(className)}><div data-xiui-dialog-body>${title ? `<h2>${escapeHtml(title)}</h2>` : ''}${bodyHtml}</div><div data-xiui-dialog-actions><button type="button" data-xiui-dialog-close>${escapeHtml(cancelLabel)}</button><button type="button" data-xiui="action-button" data-xiui-dialog-primary>${escapeHtml(primaryLabel)}</button></div></dialog>`;
}

export function renderEmptyState({ title = '', summary = '', actionHtml = '', className = '' } = {}) {
  return `<section data-xiui="empty-state"${cls(className)}>${title ? `<strong>${escapeHtml(title)}</strong>` : ''}${summary ? `<p>${escapeHtml(summary)}</p>` : ''}${actionHtml}</section>`;
}

export function renderNextActionStrip({ label = 'Next action', bodyHtml = '', className = '' } = {}) {
  return `<section data-xiui="next-action-strip"${cls(className)} aria-label="${escapeHtml(label)}">${bodyHtml}</section>`;
}

export function renderSelectableList({ items = [], selectedId = '', label = 'Options', className = '' } = {}) {
  const rows = (Array.isArray(items) ? items : []).map((item, index) => {
    const id = String(item?.id ?? `item-${index + 1}`);
    const selected = id === String(selectedId || items?.[0]?.id || '');
    return `<div data-xiui-selectable role="option" data-id="${escapeHtml(id)}" aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}">${escapeHtml(item?.label ?? id)}</div>`;
  }).join('');
  return `<div data-xiui-selectable-group role="listbox" aria-label="${escapeHtml(label)}"${cls(className)}>${rows}</div>`;
}
