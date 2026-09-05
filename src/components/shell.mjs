const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function resolveRoot(root) {
  if (!root || typeof root.querySelectorAll !== 'function') throw new TypeError('root must support querySelectorAll');
  return root;
}
function normalizeId(value, fallback) {
  const id = String(value ?? '').trim();
  return id || fallback;
}

export function renderIconButton({ label = '', title = '', iconHtml = '', badgeHtml = '', open = false, controls = '', disabled = false, className = '' } = {}) {
  const disabledAttr = disabled ? ' disabled aria-disabled="true"' : '';
  return `<button type="button" class="${escapeHtml(className)}" data-xiui="icon-button" aria-label="${escapeHtml(label)}" title="${escapeHtml(title || label)}" aria-expanded="${open ? 'true' : 'false'}"${controls ? ` aria-controls="${escapeHtml(controls)}"` : ''}${disabledAttr}><span data-xiui-icon aria-hidden="true">${iconHtml}</span>${badgeHtml}</button>`;
}

export function renderScrollRegion({ bodyHtml = '', label = '', role = 'region', id = '', ariaLabelledBy = '', className = '' } = {}) {
  const resolvedRole = role === 'tabpanel' ? 'tabpanel' : 'region';
  const aria = label && resolvedRole !== 'tabpanel' ? ` aria-label="${escapeHtml(label)}"` : '';
  const labelledBy = ariaLabelledBy ? ` aria-labelledby="${escapeHtml(ariaLabelledBy)}"` : '';
  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
  return `<div class="${escapeHtml(className)}" data-xiui="scroll-region" role="${resolvedRole}" tabindex="0"${aria}${labelledBy}${idAttr}>${bodyHtml}</div>`;
}

export function renderDrawerFooter({ actionsHtml = '', className = '' } = {}) {
  return `<footer class="${escapeHtml(className)}" data-xiui="drawer-footer">${actionsHtml}</footer>`;
}

export function renderDrawerShell({ open = false, id = '', ariaLabel = '', title = '', subtitleHtml = '', bodyHtml = '', footerHtml = '', closeButtonHtml = '', className = '', panelClassName = '', scrollContained = false } = {}) {
  const body = scrollContained ? renderScrollRegion({ bodyHtml, label: ariaLabel || title, className: 'xiui-drawer-scroll-region' }) : `<div data-xiui="drawer-body">${bodyHtml}</div>`;
  const footer = footerHtml ? renderDrawerFooter({ actionsHtml: footerHtml }) : '';
  return `<div class="${escapeHtml(className)}" data-xiui="drawer" aria-hidden="${open ? 'false' : 'true'}"${open ? ' data-open="true"' : ''}><div data-xiui="drawer-backdrop"></div><aside${id ? ` id="${escapeHtml(id)}"` : ''} class="${escapeHtml(panelClassName)}" data-xiui="drawer-panel" aria-label="${escapeHtml(ariaLabel || title)}"${scrollContained ? ' data-xiui-scroll-layout="contained"' : ''}><header data-xiui="drawer-header"><div>${title ? `<strong>${escapeHtml(title)}</strong>` : ''}${subtitleHtml}</div>${closeButtonHtml}</header>${body}${footer}</aside></div>`;
}

export function renderToastStack(items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return `<div data-xiui="toast-stack" aria-live="polite" aria-atomic="false">${items.map((item, index) => {
    const id = normalizeId(item?.id, `toast-${index + 1}`);
    const severity = normalizeId(item?.severity, 'info');
    return `<article data-xiui="toast" data-toast-id="${escapeHtml(id)}" data-severity="${escapeHtml(severity)}"><div data-xiui="toast-content">${item?.title ? `<strong>${escapeHtml(item.title)}</strong>` : ''}${item?.summary ? `<p>${escapeHtml(item.summary)}</p>` : ''}</div><button type="button" data-xiui-toast-dismiss aria-label="Dismiss notification">×</button></article>`;
  }).join('')}</div>`;
}

export function renderRouteHeader({ title = '', subtitle = '', breadcrumbHtml = '', actionHtml = '', className = '' } = {}) {
  return `<header class="${escapeHtml(className)}" data-xiui="route-header">${breadcrumbHtml}<div data-xiui="route-header-main"><div>${title ? `<h1>${escapeHtml(title)}</h1>` : ''}${subtitle ? `<p data-xiui="route-header-subtitle">${escapeHtml(subtitle)}</p>` : ''}</div>${actionHtml}</div></header>`;
}

export function renderBreadcrumbs({ items = [], className = '' } = {}) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return `<nav class="${escapeHtml(className)}" data-xiui="breadcrumbs" aria-label="Breadcrumb">${items.map((item, index) => {
    const label = escapeHtml(item?.label ?? '');
    const isLast = index === items.length - 1;
    if (isLast) return `<span aria-current="page">${label}</span>`;
    if (!item?.href) return `<span>${label}</span><span data-xiui="breadcrumb-separator" aria-hidden="true"> › </span>`;
    return `<a href="${escapeHtml(item.href)}">${label}</a><span data-xiui="breadcrumb-separator" aria-hidden="true"> › </span>`;
  }).join('')}</nav>`;
}

export function renderFormField({ id = '', label = '', hint = '', inputHtml = '', className = '' } = {}) {
  return `<div class="${escapeHtml(className)}" data-xiui="form-field">${label ? `<label for="${escapeHtml(id)}">${escapeHtml(label)}</label>` : ''}${inputHtml}${hint ? `<p data-xiui="form-hint">${escapeHtml(hint)}</p>` : ''}</div>`;
}

export function renderSelectField({ id = '', label = '', hint = '', options = [], value = '', disabled = false, className = '' } = {}) {
  const select = `<select id="${escapeHtml(id)}" data-xiui="select-field"${disabled ? ' disabled aria-disabled="true"' : ''}>${(Array.isArray(options) ? options : []).map((option) => `<option value="${escapeHtml(option?.value ?? '')}"${String(option?.value ?? '') === String(value) ? ' selected' : ''}>${escapeHtml(option?.label ?? option?.value ?? '')}</option>`).join('')}</select>`;
  return renderFormField({ id, label, hint, inputHtml: select, className });
}

export function renderTabs({ tabs = [], activeId = '', idPrefix = 'xiui-tab', panelIdPrefix = 'xiui-tabpanel', label = 'Sections', className = '' } = {}) {
  if (!Array.isArray(tabs) || tabs.length === 0) return '';
  const resolvedActive = tabs.some((tab) => String(tab?.id) === String(activeId)) ? String(activeId) : String(tabs[0]?.id ?? '');
  return `<div class="${escapeHtml(className)}" data-xiui="tabs" role="tablist" aria-label="${escapeHtml(label)}">${tabs.map((tab, index) => {
    const id = normalizeId(tab?.id, `tab-${index + 1}`);
    const active = id === resolvedActive;
    const tabDomId = `${idPrefix}-${id}`;
    const panelDomId = `${panelIdPrefix}-${id}`;
    return `<button type="button" role="tab" id="${escapeHtml(tabDomId)}" data-xiui-tab-id="${escapeHtml(id)}" aria-selected="${active ? 'true' : 'false'}" aria-controls="${escapeHtml(panelDomId)}" tabindex="${active ? '0' : '-1'}"${tab?.disabled ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(tab?.label ?? id)}</button>`;
  }).join('')}</div>`;
}

export function syncXiTabSelection(tablist, selectedTab, onSelect = null) {
  if (!tablist || typeof tablist.querySelectorAll !== 'function') throw new TypeError('tablist must support querySelectorAll');
  if (!selectedTab || typeof selectedTab.getAttribute !== 'function') throw new TypeError('selectedTab must support attributes');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  if (!tabs.includes(selectedTab) || selectedTab.disabled) return false;
  for (const tab of tabs) {
    const selected = tab === selectedTab;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.setAttribute('tabindex', selected ? '0' : '-1');
    const panelId = tab.getAttribute('aria-controls');
    const panel = panelId && tab.ownerDocument?.getElementById ? tab.ownerDocument.getElementById(panelId) : null;
    if (panel) panel.hidden = !selected;
  }
  onSelect?.(selectedTab.getAttribute('data-xiui-tab-id'), selectedTab);
  return true;
}

export function bindXiTabs(root = document, onSelect = null) {
  const scope = resolveRoot(root);
  const cleanups = [];
  for (const tablist of scope.querySelectorAll('[data-xiui="tabs"][role="tablist"]')) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const enabled = () => tabs.filter(tab => !tab.disabled);
    for (const tab of tabs) {
      const activate = () => { if (syncXiTabSelection(tablist, tab, onSelect)) tab.focus?.(); };
      const onClick = () => activate();
      const onKeyDown = event => {
        const available = enabled();
        const index = available.indexOf(tab);
        if (index < 0) return;
        let next = -1;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = available.length - 1;
        else if (NEXT_KEYS.has(event.key)) next = (index + 1) % available.length;
        else if (PREVIOUS_KEYS.has(event.key)) next = (index - 1 + available.length) % available.length;
        if (next < 0) return;
        event.preventDefault();
        syncXiTabSelection(tablist, available[next], onSelect);
        available[next].focus?.();
      };
      tab.addEventListener('click', onClick);
      tab.addEventListener('keydown', onKeyDown);
      cleanups.push(() => { tab.removeEventListener('click', onClick); tab.removeEventListener('keydown', onKeyDown); });
    }
  }
  return () => cleanups.splice(0).forEach(fn => fn());
}

export function bindXiToasts(root = document, onDismiss = null) {
  const scope = resolveRoot(root);
  const cleanups = [];
  for (const button of scope.querySelectorAll('[data-xiui-toast-dismiss]')) {
    const onClick = () => {
      const toast = button.closest?.('[data-xiui="toast"]');
      const id = toast?.getAttribute?.('data-toast-id') ?? null;
      toast?.remove?.();
      onDismiss?.(id);
    };
    button.addEventListener('click', onClick);
    cleanups.push(() => button.removeEventListener('click', onClick));
  }
  return () => cleanups.splice(0).forEach(fn => fn());
}

export function initXiShell(root = document, options = {}) {
  const destroyTabs = bindXiTabs(root, options.onTabSelect ?? null);
  const destroyToasts = bindXiToasts(root, options.onToastDismiss ?? null);
  return () => { destroyToasts(); destroyTabs(); };
}
