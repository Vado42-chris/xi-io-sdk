import { resolveProductWindow } from './registry.mjs';

const esc = (value) => String(value ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function projectOption(project, selected) {
  const ref = String(project?.project_ref || '').trim();
  const label = String(project?.label || ref || 'Untitled project').trim();
  if (!ref) return '';
  return `<option value="${esc(ref)}"${ref===selected?' selected':''}>${esc(label)}</option>`;
}

export function renderProductWindowIntermediary({
  product_ref,
  current_project_ref = '',
  recent_projects = [],
  chat_placeholder = 'Ask @ibal about this product or project…',
  status = 'Choose a project or continue the current one.',
} = {}) {
  const product = resolveProductWindow(product_ref);
  const projects = Array.isArray(recent_projects) ? recent_projects.slice(0, 20) : [];
  return `
<section data-xiio-product-window="intermediary" data-product-ref="${esc(product.product_ref)}">
  <header data-xiio-product-window-header>
    <div>
      <small>XI-IO PRODUCT</small>
      <h1>${esc(product.label)}</h1>
      <p>${esc(product.family)} · ${esc(product.lifecycle)}</p>
    </div>
    <output data-xiio-product-window-status role="status">${esc(status)}</output>
  </header>

  <div data-xiio-product-window-grid>
    <section data-xiio-project-manager aria-labelledby="xiio-project-heading">
      <h2 id="xiio-project-heading">Project</h2>
      <label>
        <span>Current or recent project</span>
        <select data-xiio-project-select>
          <option value="">No project selected</option>
          ${projects.map((p)=>projectOption(p,current_project_ref)).join('')}
        </select>
      </label>
      <button type="button" data-xiio-project-new>New project</button>
      <button type="button" data-xiio-project-manage>Manage projects</button>
    </section>

    <section data-xiio-chat aria-labelledby="xiio-chat-heading">
      <h2 id="xiio-chat-heading">Chat</h2>
      <div data-xiio-chat-transcript aria-live="polite"></div>
      <form data-xiio-chat-form>
        <label>
          <span class="xiio-sr-only">Message</span>
          <textarea rows="3" data-xiio-chat-input placeholder="${esc(chat_placeholder)}"></textarea>
        </label>
        <button type="submit">Send</button>
      </form>
    </section>
  </div>

  <footer data-xiio-product-window-footer>
    <span>Project management and chat are shared XI-IO product services.</span>
    <button type="button" data-xiio-product-open>Open ${esc(product.label.replace(/^xi-io:\s*/i,''))}</button>
  </footer>
</section>`.trim();
}

// A handler returning a receipt-shaped object does not prove Ward admission or
// BINS custody. It only confirms the connected host accepted this UI request.
export function bindProductWindowIntermediary(root, handlers = {}) {
  if (!root || typeof root.querySelector !== 'function') throw new TypeError('root must support querySelector');
  const cleanups = [];
  let disposed = false;
  let sending = false;
  const status = root.querySelector('[data-xiio-product-window-status]');
  const report = (message) => { if (!disposed && status) status.textContent = message; };

  const on = (selector, event, name, args = (e) => [e]) => {
    const el = root.querySelector(selector);
    if (!el) return;
    const handler = handlers[name];
    if (typeof handler !== 'function') {
      el.disabled = true;
      el.setAttribute?.('aria-disabled', 'true');
      return;
    }
    const listener = (eventValue) => {
      try {
        const result = handler(...args(eventValue));
        Promise.resolve(result).catch(() => report('Connection unavailable. Your work has not been submitted.'));
      } catch {
        report('Connection unavailable. Your work has not been submitted.');
      }
    };
    el.addEventListener(event, listener);
    cleanups.push(() => el.removeEventListener(event, listener));
  };

  on('[data-xiio-project-select]', 'change', 'onProjectSelect', (event) => [event.target.value || null]);
  on('[data-xiio-project-new]', 'click', 'onProjectNew', () => []);
  on('[data-xiio-project-manage]', 'click', 'onProjectManage', () => []);
  on('[data-xiio-product-open]', 'click', 'onOpenProduct', () => []);

  const form = root.querySelector('[data-xiio-chat-form]');
  const input = form?.querySelector('[data-xiio-chat-input]');
  const sendButton = form?.querySelector('[type="submit"]');
  if (form) {
    if (typeof handlers.onChatSend !== 'function') {
      if (sendButton) sendButton.disabled = true;
      report('Chat is unavailable until the registered @ibal connection is ready.');
    } else {
      const submit = async (event) => {
        event.preventDefault();
        if (sending || disposed) return;
        const message = String(input?.value || '').trim();
        if (!message) return;
        sending = true;
        if (sendButton) sendButton.disabled = true;
        try {
          // Explicit UI acceptance is mandatory. A returned undefined, false,
          // thrown error or failed promise must retain the unsent text.
          const result = await handlers.onChatSend(message);
          if (!result || result.accepted !== true) throw new Error('CHAT_NOT_ACCEPTED');
          if (!disposed && input && input.value.trim() === message) input.value = '';
          report('Message accepted by the connected host. Delivery is not yet verified.');
        } catch {
          report('Message not accepted. Your draft is preserved.');
        } finally {
          sending = false;
          if (!disposed && sendButton) sendButton.disabled = false;
        }
      };
      form.addEventListener('submit', submit);
      cleanups.push(() => form.removeEventListener('submit', submit));
    }
  }

  return () => { disposed = true; cleanups.splice(0).forEach((fn) => fn()); };
}
