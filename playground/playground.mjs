import * as Core from '../src/components/core.mjs';
import { initXiUi } from '../src/components/behavior.mjs';
import * as Shell from '../src/components/shell.mjs';

const catalog = await fetch('../src/catalog/primitives.json').then(r => {
  if (!r.ok) throw new Error(`catalog fetch failed: ${r.status}`);
  return r.json();
});

const sourceEl = document.querySelector('#component-source');
const managementEl = document.querySelector('#management-authority');
const stateEl = document.querySelector('#catalog-state');
const grid = document.querySelector('#primitive-grid');
const gaps = document.querySelector('#known-gaps');
const search = document.querySelector('#primitive-search');

sourceEl.textContent = catalog.component_source_of_truth;
managementEl.textContent = catalog.management_authority;
stateEl.textContent = `${catalog.primitives.length} primitives · ${catalog.known_gaps.length} known gaps`;
gaps.innerHTML = catalog.known_gaps.map(gap => `<span class="gap-chip">${gap}</span>`).join('');

const examples = {
  'page-shell': () => Core.renderPageShell({ bodyHtml: '<div>Page shell content</div>' }),
  section: () => Core.renderSection({ label: 'Example section', bodyHtml: '<strong>Section</strong><span>Semantic grouping</span>' }),
  panel: () => Core.renderPanel({ bodyHtml: '<strong>Panel</strong><p>Raised visual grouping.</p>' }),
  grid: () => Core.renderGrid({ bodyHtml: Core.renderPanel({ bodyHtml: 'A' }) + Core.renderPanel({ bodyHtml: 'B' }) }),
  stack: () => Core.renderStack({ bodyHtml: '<span>First</span><span>Second</span><span>Third</span>' }),
  'status-badge': () => '<div class="playground-inline-stack">' + ['verified','warning','critical','unknown'].map(tone => Core.renderStatusBadge({ label: tone, tone })).join('') + '</div>',
  'action-button': () => Core.renderActionButton({ label: 'Run action' }),
  'evidence-panel': () => Core.renderEvidencePanel({ title: 'Evidence', rows: [{ label: 'Generation', value: 'current' }, { label: 'Authority', value: 'none' }] }),
  'context-inspector': () => Core.renderContextInspector({ bodyHtml: '<strong>Context</strong><p>Selected primitive metadata.</p>' }),
  'receipt-row': () => Core.renderReceiptRow({ label: 'Readback', value: 'provider-current', statusHtml: Core.renderStatusBadge({ label: 'PASS', tone: 'verified' }) }),
  'confirmation-dialog': () => Core.renderActionButton({ label: 'Open dialog', attributes: 'data-xiui-dialog-target="playground-dialog"' }) + Core.renderConfirmationDialog({ id: 'playground-dialog', title: 'Confirm action', bodyHtml: '<p>Dialog behavior is SDK-owned. Effect authority is not.</p>' }),
  'empty-state': () => Core.renderEmptyState({ title: 'Nothing here yet', summary: 'Empty states remain explicit.' }),
  'next-action-strip': () => Core.renderNextActionStrip({ bodyHtml: '<strong>Next:</strong> qualify the selected candidate.' }),
  'selectable-list': () => Core.renderSelectableList({ selectedId: 'b', items: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }] }),
  'icon-button': () => Shell.renderIconButton({ label: 'More options', iconHtml: '•••' }),
  'drawer-shell': () => Core.renderActionButton({ label: 'Open drawer', attributes: 'data-playground-open-drawer' }) + Shell.renderDrawerShell({ id: 'playground-drawer', title: 'Drawer shell', ariaLabel: 'Drawer shell', bodyHtml: '<p>Contained scroll body.</p><p>Management authority remains external.</p>', footerHtml: Core.renderActionButton({ label: 'Done', attributes: 'data-playground-close-drawer' }), closeButtonHtml: Shell.renderIconButton({ label: 'Close drawer', iconHtml: '×', className: 'drawer-close' }), scrollContained: true }),
  'scroll-region': () => Shell.renderScrollRegion({ label: 'Scrollable example', bodyHtml: '<p>Focusable region</p><p>Second row</p>' }),
  'drawer-footer': () => Shell.renderDrawerFooter({ actionsHtml: Core.renderActionButton({ label: 'Save' }) }),
  toast: () => Shell.renderToastStack([{ id: 'toast-1', severity: 'info', title: 'Currentness changed', summary: 'Rebind before mutation.' }]),
  'route-header': () => Shell.renderRouteHeader({ title: 'Components', subtitle: 'SDK source of truth', breadcrumbHtml: Shell.renderBreadcrumbs({ items: [{ label: 'SDK', href: '#' }, { label: 'Components' }] }) }),
  breadcrumbs: () => Shell.renderBreadcrumbs({ items: [{ label: 'SDK', href: '#' }, { label: 'Playground', href: '#' }, { label: 'Tabs' }] }),
  'form-field': () => Shell.renderFormField({ id: 'example-name', label: 'Name', hint: 'Neutral field wrapper', inputHtml: '<input id="example-name" value="Example">' }),
  'select-field': () => Shell.renderSelectField({ id: 'example-select', label: 'State', value: 'current', options: [{ value: 'current', label: 'Current' }, { value: 'stale', label: 'Stale' }] }),
  tabs: () => Shell.renderTabs({ activeId: 'overview', tabs: [{ id: 'overview', label: 'Overview' }, { id: 'evidence', label: 'Evidence' }, { id: 'disabled', label: 'Disabled', disabled: true }] }) + '<div class="playground-tabpanels"><section id="xiui-tabpanel-overview" role="tabpanel">Overview panel</section><section id="xiui-tabpanel-evidence" role="tabpanel" hidden>Evidence panel</section><section id="xiui-tabpanel-disabled" role="tabpanel" hidden>Disabled panel</section></div>'
};

function renderCard(item) {
  const render = examples[item.id];
  const preview = render ? render() : `<p>No visual fixture for ${item.id}.</p>`;
  return `<article class="primitive-card" data-primitive-id="${item.id}" data-family="${item.family}"><header><div><h2>${item.id}</h2><div class="meta">${item.family} · ${item.export}</div></div><span class="maturity">${item.maturity}</span></header><div class="primitive-preview">${preview}</div><pre class="primitive-code">${item.source}${item.behavior_source ? `\n${item.behavior_source}` : ''}</pre></article>`;
}

function renderAll(filter = '') {
  const q = filter.trim().toLowerCase();
  const items = catalog.primitives.filter(item => !q || [item.id, item.family, item.export, item.provenance].join(' ').toLowerCase().includes(q));
  grid.innerHTML = items.map(renderCard).join('');
  initXiUi(grid);
  Shell.initXiShell(grid);
  wireDrawer();
}

function wireDrawer() {
  const drawer = grid.querySelector('[data-xiui="drawer"]');
  if (!drawer) return;
  const open = () => { drawer.setAttribute('aria-hidden', 'false'); drawer.dataset.open = 'true'; };
  const close = () => { drawer.setAttribute('aria-hidden', 'true'); delete drawer.dataset.open; };
  grid.querySelector('[data-playground-open-drawer]')?.addEventListener('click', open);
  drawer.querySelector('[data-playground-close-drawer]')?.addEventListener('click', close);
  drawer.querySelector('.drawer-close')?.addEventListener('click', close);
  drawer.querySelector('[data-xiui="drawer-backdrop"]')?.addEventListener('click', close);
}

search.addEventListener('input', () => renderAll(search.value));
renderAll();
