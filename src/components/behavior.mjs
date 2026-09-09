const ACTIVATE_KEYS = new Set(['Enter', ' ']);
const NEXT_KEYS = new Set(['ArrowDown', 'ArrowRight']);
const PREVIOUS_KEYS = new Set(['ArrowUp', 'ArrowLeft']);

function resolveRoot(root) {
  if (!root || typeof root.querySelectorAll !== 'function') throw new TypeError('root must support querySelectorAll');
  return root;
}

function focusablesWithin(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function setFallbackModalBackground(dialog, inert) {
  const body = dialog?.ownerDocument?.body;
  if (!body) return;
  if (inert) {
    dialog.__xiioInerted = [];
    let current = dialog;
    while (current && current !== body) {
      const parent = current.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) {
        if (sibling === current) continue;
        dialog.__xiioInerted.push({ element: sibling, hadInert: sibling.hasAttribute('inert') });
        sibling.setAttribute('inert', '');
      }
      current = parent;
    }
  } else {
    for (const record of dialog.__xiioInerted ?? []) if (!record.hadInert) record.element.removeAttribute('inert');
    delete dialog.__xiioInerted;
  }
}

export function openXiDialog(dialog, invoker = null) {
  if (!dialog) throw new TypeError('dialog is required');
  if (invoker && typeof invoker.focus === 'function') dialog.__xiioInvoker = invoker;
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
    dialog.__xiioFallbackModal = false;
  } else {
    dialog.hidden = false;
    dialog.setAttribute('open', '');
    dialog.setAttribute('role', dialog.getAttribute('role') || 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.__xiioFallbackModal = true;
    setFallbackModalBackground(dialog, true);
  }
  const focusTarget = dialog.querySelector?.('[data-xiui-dialog-primary], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  focusTarget?.focus?.();
}

export function closeXiDialog(dialog) {
  if (!dialog) return;
  if (dialog.__xiioFallbackModal) setFallbackModalBackground(dialog, false);
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else {
    dialog.hidden = true;
    dialog.removeAttribute?.('open');
  }
  dialog.__xiioFallbackModal = false;
  dialog.__xiioInvoker?.focus?.();
  delete dialog.__xiioInvoker;
}

function trapFallbackDialogTab(event, dialog) {
  if (event.key !== 'Tab' || !dialog?.__xiioFallbackModal) return false;
  const focusables = focusablesWithin(dialog);
  if (focusables.length === 0) {
    event.preventDefault();
    dialog.focus?.();
    return true;
  }
  const currentIndex = focusables.indexOf(dialog.ownerDocument?.activeElement);
  const delta = event.shiftKey ? -1 : 1;
  const nextIndex = currentIndex < 0 ? (event.shiftKey ? focusables.length - 1 : 0) : (currentIndex + delta + focusables.length) % focusables.length;
  event.preventDefault();
  focusables[nextIndex].focus();
  return true;
}

export function bindXiDialogs(root = document) {
  const scope = resolveRoot(root);
  const cleanups = [];
  for (const trigger of scope.querySelectorAll('[data-xiui-dialog-target]')) {
    const targetId = trigger.getAttribute('data-xiui-dialog-target');
    const dialog = targetId ? scope.querySelector(`#${CSS.escape(targetId)}`) : null;
    if (!dialog) continue;
    const onClick = () => openXiDialog(dialog, trigger);
    trigger.addEventListener('click', onClick);
    cleanups.push(() => trigger.removeEventListener('click', onClick));
  }
  for (const closer of scope.querySelectorAll('[data-xiui-dialog-close]')) {
    const dialog = closer.closest('dialog,[role="dialog"]');
    if (!dialog) continue;
    const onClick = () => closeXiDialog(dialog);
    closer.addEventListener('click', onClick);
    cleanups.push(() => closer.removeEventListener('click', onClick));
  }
  const onKeyDown = event => {
    const dialog = event.target?.closest?.('dialog[open],[role="dialog"][open]');
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeXiDialog(dialog);
      return;
    }
    trapFallbackDialogTab(event, dialog);
  };
  scope.addEventListener?.('keydown', onKeyDown);
  cleanups.push(() => scope.removeEventListener?.('keydown', onKeyDown));
  return () => cleanups.splice(0).forEach(fn => fn());
}

export function bindXiSelectableLists(root = document, onSelect = null) {
  const scope = resolveRoot(root);
  const cleanups = [];
  for (const group of scope.querySelectorAll('[data-xiui-selectable-group]')) {
    const items = [...group.querySelectorAll('[data-xiui-selectable]')];
    if (items.length === 0) continue;
    if (!group.hasAttribute('role')) group.setAttribute('role', 'listbox');
    let selected = items.find(item => item.getAttribute('aria-selected') === 'true') ?? items[0];
    const sync = selectedItem => {
      selected = selectedItem;
      for (const item of items) {
        const isSelected = item === selectedItem;
        item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        item.setAttribute('tabindex', isSelected ? '0' : '-1');
      }
      onSelect?.(selectedItem);
    };
    sync(selected);
    const move = (item, key) => {
      let index = items.indexOf(item);
      if (key === 'Home') index = 0;
      else if (key === 'End') index = items.length - 1;
      else if (NEXT_KEYS.has(key)) index = (index + 1) % items.length;
      else if (PREVIOUS_KEYS.has(key)) index = (index - 1 + items.length) % items.length;
      else return false;
      sync(items[index]);
      items[index].focus();
      return true;
    };
    for (const item of items) {
      const onClick = () => sync(item);
      const onKeyDown = event => {
        if (ACTIVATE_KEYS.has(event.key)) {
          event.preventDefault();
          sync(item);
          return;
        }
        if (move(item, event.key)) event.preventDefault();
      };
      item.addEventListener('click', onClick);
      item.addEventListener('keydown', onKeyDown);
      cleanups.push(() => {
        item.removeEventListener('click', onClick);
        item.removeEventListener('keydown', onKeyDown);
      });
    }
  }
  return () => cleanups.splice(0).forEach(fn => fn());
}

export function initXiUi(root = document, options = {}) {
  const destroyDialogs = bindXiDialogs(root);
  const destroyLists = bindXiSelectableLists(root, options.onSelect ?? null);
  return () => {
    destroyLists();
    destroyDialogs();
  };
}
