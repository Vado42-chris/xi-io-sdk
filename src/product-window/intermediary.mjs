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

export function bindProductWindowIntermediary(root, handlers = {}) {
  if (!root || typeof root.querySelector !== 'function') throw new TypeError('root must support querySelector');
  const cleanups = [];
  const on = (selector, event, fn) => {
    const el = root.querySelector(selector);
    if (!el || typeof fn !== 'function') return;
    el.addEventListener(event, fn);
    cleanups.push(() => el.removeEventListener(event, fn));
  };

  on('[data-xiio-project-select]','change',(event)=>{
    handlers.onProjectSelect?.(event.target.value || null);
  });
  on('[data-xiio-project-new]','click',()=>handlers.onProjectNew?.());
  on('[data-xiio-project-manage]','click',()=>handlers.onProjectManage?.());
  on('[data-xiio-product-open]','click',()=>handlers.onOpenProduct?.());

  const form = root.querySelector('[data-xiio-chat-form]');
  if (form && typeof handlers.onChatSend === 'function') {
    const submit = (event) => {
      event.preventDefault();
      const input = form.querySelector('[data-xiio-chat-input]');
      const text = String(input?.value || '').trim();
      if (!text) return;
      handlers.onChatSend(text);
      if (input) input.value = '';
    };
    form.addEventListener('submit', submit);
    cleanups.push(() => form.removeEventListener('submit', submit));
  }

  return () => cleanups.splice(0).forEach((fn)=>fn());
}
