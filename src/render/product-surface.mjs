import * as Core from '../components/core.mjs';
import * as Shell from '../components/shell.mjs';

const MODEL_SCHEMA = 'xiio.sdk.product-surface/v1';
const FIELD_TYPES = new Set(['text', 'number', 'checkbox', 'select']);
const STATUS_TONES = new Set(['critical', 'warning', 'verified', 'unknown']);
const FORBIDDEN_KEYS = new Set([
  'authority', 'authority_ref', 'evidence_ref', 'provider', 'provider_ref', 'endpoint', 'url',
  'host', 'hostname', 'token', 'secret', 'api_key', 'password', 'physical_path', 'raw_html',
  'body_html', 'icon_html', 'framework_ref', 'issue_ref', 'work_ref', 'assignment_ref'
]);
const TOP_KEYS = new Set(['schema', 'surface_id', 'title', 'subtitle', 'environment', 'statuses', 'sections', 'actions', 'notice']);
const SECTION_KEYS = new Set(['id', 'title', 'summary', 'fields', 'rows']);
const FIELD_KEYS = new Set(['id', 'label', 'type', 'value', 'hint', 'min', 'max', 'step', 'required', 'disabled', 'options']);
const ACTION_KEYS = new Set(['id', 'label', 'disabled', 'kind']);
const STATUS_KEYS = new Set(['label', 'tone']);
const ROW_KEYS = new Set(['label', 'value', 'status']);
const OPTION_KEYS = new Set(['value', 'label']);
const MAX_SECTIONS = 20;
const MAX_FIELDS_PER_SECTION = 50;
const MAX_ROWS_PER_SECTION = 100;
const MAX_ACTIONS = 20;
const MAX_TEXT = 2000;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}

function assertClosedShape(value, allowed, label) {
  assertObject(value, label);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`${label} contains unsupported keys: ${unknown.sort().join(',')}`);
}

function assertText(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return;
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  if (value.length > MAX_TEXT) throw new TypeError(`${label} exceeds ${MAX_TEXT} characters`);
}

function assertId(value, label) {
  assertText(value, label);
  if (!/^[a-z][a-z0-9._:-]*$/i.test(value)) throw new TypeError(`${label} contains unsupported characters`);
}

function rejectForbiddenKeys(value, label = 'model', depth = 0) {
  if (depth > 12) throw new TypeError(`${label} exceeds maximum nesting depth`);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((item, index) => rejectForbiddenKeys(item, `${label}[${index}]`, depth + 1));
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) throw new TypeError(`${label}.${key} is forbidden in the public product surface model`);
    rejectForbiddenKeys(child, `${label}.${key}`, depth + 1);
  }
}

function normalizeStatus(status, label) {
  assertClosedShape(status, STATUS_KEYS, label);
  assertText(status.label, `${label}.label`);
  if (!STATUS_TONES.has(status.tone)) throw new TypeError(`${label}.tone unsupported`);
  return { label: status.label, tone: status.tone };
}

function normalizeOptions(options, label) {
  if (!Array.isArray(options) || !options.length) throw new TypeError(`${label} must be a non-empty array`);
  return options.map((option, index) => {
    assertClosedShape(option, OPTION_KEYS, `${label}[${index}]`);
    assertText(String(option.value ?? ''), `${label}[${index}].value`);
    assertText(option.label, `${label}[${index}].label`);
    return { value: String(option.value), label: option.label };
  });
}

function normalizeField(field, label) {
  assertClosedShape(field, FIELD_KEYS, label);
  assertId(field.id, `${label}.id`);
  assertText(field.label, `${label}.label`);
  if (!FIELD_TYPES.has(field.type)) throw new TypeError(`${label}.type unsupported`);
  if (field.hint !== undefined) assertText(field.hint, `${label}.hint`, { optional: true });
  if (field.required !== undefined && typeof field.required !== 'boolean') throw new TypeError(`${label}.required must be boolean`);
  if (field.disabled !== undefined && typeof field.disabled !== 'boolean') throw new TypeError(`${label}.disabled must be boolean`);
  if (field.type === 'number') {
    for (const key of ['min', 'max', 'step']) {
      if (field[key] !== undefined && (typeof field[key] !== 'number' || !Number.isFinite(field[key]))) throw new TypeError(`${label}.${key} must be a finite number`);
    }
    if (field.value !== undefined && (typeof field.value !== 'number' || !Number.isFinite(field.value))) throw new TypeError(`${label}.value must be a finite number`);
  } else if (field.type === 'checkbox') {
    if (field.value !== undefined && typeof field.value !== 'boolean') throw new TypeError(`${label}.value must be boolean`);
  } else if (field.type === 'select') {
    field.options = normalizeOptions(field.options, `${label}.options`);
    if (field.value !== undefined && !field.options.some((option) => option.value === String(field.value))) throw new TypeError(`${label}.value must match an option`);
  } else if (field.value !== undefined && typeof field.value !== 'string') {
    throw new TypeError(`${label}.value must be string`);
  }
  return structuredClone(field);
}

function normalizeRow(row, label) {
  assertClosedShape(row, ROW_KEYS, label);
  assertText(row.label, `${label}.label`);
  if (!['string', 'number', 'boolean'].includes(typeof row.value)) throw new TypeError(`${label}.value must be scalar`);
  if (row.status !== undefined) row.status = normalizeStatus(row.status, `${label}.status`);
  return structuredClone(row);
}

function normalizeSection(section, index) {
  const label = `sections[${index}]`;
  assertClosedShape(section, SECTION_KEYS, label);
  assertId(section.id, `${label}.id`);
  assertText(section.title, `${label}.title`);
  if (section.summary !== undefined) assertText(section.summary, `${label}.summary`, { optional: true });
  const fields = section.fields ?? [];
  const rows = section.rows ?? [];
  if (!Array.isArray(fields) || fields.length > MAX_FIELDS_PER_SECTION) throw new TypeError(`${label}.fields exceeds bounded array contract`);
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_SECTION) throw new TypeError(`${label}.rows exceeds bounded array contract`);
  return { id: section.id, title: section.title, summary: section.summary ?? '', fields: fields.map((field, i) => normalizeField(field, `${label}.fields[${i}]`)), rows: rows.map((row, i) => normalizeRow(row, `${label}.rows[${i}]`)) };
}

function normalizeAction(action, index) {
  const label = `actions[${index}]`;
  assertClosedShape(action, ACTION_KEYS, label);
  assertId(action.id, `${label}.id`);
  assertText(action.label, `${label}.label`);
  if (action.disabled !== undefined && typeof action.disabled !== 'boolean') throw new TypeError(`${label}.disabled must be boolean`);
  if (action.kind !== undefined && !['primary', 'secondary'].includes(action.kind)) throw new TypeError(`${label}.kind unsupported`);
  return { id: action.id, label: action.label, disabled: action.disabled === true, kind: action.kind ?? 'secondary' };
}

export function normalizeProductSurface(model) {
  rejectForbiddenKeys(model);
  assertClosedShape(model, TOP_KEYS, 'model');
  if (model.schema !== MODEL_SCHEMA) throw new TypeError(`model.schema must equal ${MODEL_SCHEMA}`);
  assertId(model.surface_id, 'model.surface_id');
  assertText(model.title, 'model.title');
  if (model.subtitle !== undefined) assertText(model.subtitle, 'model.subtitle', { optional: true });
  if (model.notice !== undefined) assertText(model.notice, 'model.notice', { optional: true });
  if (model.environment !== undefined && !['DEV', 'TEST', 'LIVE', 'UNKNOWN'].includes(model.environment)) throw new TypeError('model.environment unsupported');
  if (!Array.isArray(model.statuses) || model.statuses.length > 20) throw new TypeError('model.statuses exceeds bounded array contract');
  if (!Array.isArray(model.sections) || !model.sections.length || model.sections.length > MAX_SECTIONS) throw new TypeError('model.sections must be a bounded non-empty array');
  if (!Array.isArray(model.actions) || model.actions.length > MAX_ACTIONS) throw new TypeError('model.actions exceeds bounded array contract');
  const normalized = {
    schema: MODEL_SCHEMA,
    surface_id: model.surface_id,
    title: model.title,
    subtitle: model.subtitle ?? '',
    environment: model.environment ?? 'UNKNOWN',
    notice: model.notice ?? '',
    statuses: model.statuses.map((status, i) => normalizeStatus(status, `statuses[${i}]`)),
    sections: model.sections.map(normalizeSection),
    actions: model.actions.map(normalizeAction),
  };
  const ids = [
    ...normalized.sections.map((section) => `section:${section.id}`),
    ...normalized.sections.flatMap((section) => section.fields.map((field) => `field:${field.id}`)),
    ...normalized.actions.map((action) => `action:${action.id}`),
  ];
  if (ids.length !== new Set(ids).size) throw new TypeError('duplicate section/field/action identity');
  return normalized;
}

function renderInput(field) {
  const id = `xiio-field-${field.id}`;
  const common = ` id="${escapeHtml(id)}" data-xiio-field="${escapeHtml(field.id)}"${field.disabled ? ' disabled aria-disabled="true"' : ''}${field.required ? ' required' : ''}`;
  if (field.type === 'checkbox') {
    const input = `<input type="checkbox"${common}${field.value ? ' checked' : ''}>`;
    return Shell.renderFormField({ id, label: field.label, hint: field.hint, inputHtml: input });
  }
  if (field.type === 'select') {
    const select = `<select${common}>${field.options.map((option) => `<option value="${escapeHtml(option.value)}"${String(field.value ?? '') === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`;
    return Shell.renderFormField({ id, label: field.label, hint: field.hint, inputHtml: select });
  }
  const type = field.type === 'number' ? 'number' : 'text';
  const numeric = field.type === 'number'
    ? `${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''}${field.step !== undefined ? ` step="${field.step}"` : ''}`
    : '';
  const value = field.value === undefined ? '' : String(field.value);
  return Shell.renderFormField({ id, label: field.label, hint: field.hint, inputHtml: `<input type="${type}"${common}${numeric} value="${escapeHtml(value)}">` });
}

function renderSection(section) {
  const fields = section.fields.length ? `<div data-xiio-surface-fields>${section.fields.map(renderInput).join('')}</div>` : '';
  const rows = section.rows.length ? Core.renderEvidencePanel({ title: `${section.title} details`, rows: section.rows.map((row) => ({ label: row.label, value: row.value })) }) : '';
  return Core.renderPanel({ className: 'xiio-product-surface-section', bodyHtml: `<h2>${escapeHtml(section.title)}</h2>${section.summary ? `<p>${escapeHtml(section.summary)}</p>` : ''}${fields}${rows}` });
}

export function renderProductSurface(model) {
  const surface = normalizeProductSurface(model);
  const statuses = surface.statuses.map((status) => Core.renderStatusBadge(status)).join('');
  const actions = surface.actions.map((action) => Core.renderActionButton({
    label: action.label,
    disabled: action.disabled,
    className: action.kind === 'primary' ? 'xiio-surface-action-primary' : '',
    data: { 'xiio-action': action.id },
  })).join('');
  const header = Shell.renderRouteHeader({
    title: surface.title,
    subtitle: surface.subtitle,
    actionHtml: statuses ? `<div data-xiio-surface-statuses>${statuses}</div>` : '',
  });
  const environment = Core.renderReceiptRow({
    label: 'Environment',
    value: surface.environment,
    statusHtml: Core.renderStatusBadge({
      label: surface.environment,
      tone: surface.environment === 'TEST' ? 'warning' : surface.environment === 'LIVE' ? 'critical' : surface.environment === 'DEV' ? 'verified' : 'unknown',
    }),
  });
  const notice = surface.notice ? Core.renderNextActionStrip({ bodyHtml: `<span>${escapeHtml(surface.notice)}</span>` }) : '';
  const body = `${header}${environment}${notice}<div data-xiio-surface-sections>${surface.sections.map(renderSection).join('')}</div>${actions ? `<footer data-xiio-surface-actions>${actions}</footer>` : ''}<section data-xiio-surface-result aria-live="polite"></section>`;
  return Core.renderPageShell({ className: 'xiio-product-surface', bodyHtml: body });
}

export function collectProductSurfaceValues(root) {
  if (!root || typeof root.querySelectorAll !== 'function') throw new TypeError('root must support querySelectorAll');
  const values = {};
  for (const field of root.querySelectorAll('[data-xiio-field]')) {
    const id = field.getAttribute('data-xiio-field');
    if (!id) continue;
    if (field.type === 'checkbox') values[id] = Boolean(field.checked);
    else if (field.type === 'number') values[id] = field.value === '' ? null : Number(field.value);
    else values[id] = field.value;
  }
  return values;
}

export function bindProductSurface(root, { onAction = null } = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') throw new TypeError('root must support querySelectorAll');
  const cleanups = [];
  for (const button of root.querySelectorAll('[data-xiio-action]')) {
    const handler = async () => {
      if (button.disabled) return;
      const actionId = button.getAttribute('data-xiio-action');
      const values = collectProductSurfaceValues(root);
      await onAction?.({ actionId, values, button, root });
    };
    button.addEventListener('click', handler);
    cleanups.push(() => button.removeEventListener('click', handler));
  }
  return () => cleanups.splice(0).forEach((cleanup) => cleanup());
}
