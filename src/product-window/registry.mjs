export const PRODUCT_WINDOW_SCHEMA = 'xiio.product-window-registry/v1';
export const PRODUCT_WINDOW_CONTRACT = 'xiio.product-window-contract/v1';
export const PRODUCT_WINDOW_TEMPLATE = 'SAM_LAW_WHITE_LABEL_INTERMEDIARY';

const shared = Object.freeze({
  host: 'HEX',
  frame_owner: 'Vado42-chris/xi-io-node:src/components/desktop/WindowFrame.jsx',
  intermediary_template: PRODUCT_WINDOW_TEMPLATE,
  intermediary_owner: 'SAM_LAW_DOCUMENT_WINDOW_PATTERN',
  required_intermediary: Object.freeze([
    'PRODUCT_IDENTITY',
    'PROJECT_MANAGER',
    'CHAT',
    'RECENT_OR_CURRENT_PROJECT',
    'PRODUCT_LAUNCH_STATE',
  ]),
  frame_settings: Object.freeze([
    'BLACK_LEVEL',
  ]),
  frame_controls: Object.freeze([
    'MINIMIZE',
    'MAXIMIZE_RESTORE',
    'CLOSE',
  ]),
  product_settings_location: 'INSIDE_PRODUCT_BODY',
  project_management: 'REQUIRED',
  chat: 'REQUIRED',
  linux_surface: 'REQUIRED',
  empire_os_surface: 'REQUIRED',
  effect_authority: 0,
});

function product(id, label, family, extra = {}) {
  return Object.freeze({
    product_ref: `xi-io:${id}`,
    label,
    family,
    lifecycle: extra.lifecycle || 'EXISTING_PRODUCT',
    body_owner: extra.body_owner || 'EXISTING_PRODUCT_OWNER',
    aliases: Object.freeze(extra.aliases || []),
    troubleshooting_surface: extra.troubleshooting_surface || null,
    shared_window: shared,
  });
}

export const XIIO_PRODUCT_LINEUP = Object.freeze([
  product('desktop', 'xi-io: desktop', 'SYSTEM'),
  product('ibal', 'xi-io: ibal', 'AI_CONDUCTOR'),
  product('switchboard', 'xi-io: Switchboard', 'CONTROL_PLANE'),
  product('movie-time', 'xi-io: movie time', 'MEDIA'),
  product('hex', 'xi-io: hex', 'SYSTEM'),
  product('repo-reaper', 'xi-io: repo reaper', 'DEVELOPER_TOOL'),
  product('wordpress', 'xi-io: wordpress', 'PUBLISHING'),
  product('ward', 'xi-io: Ward', 'SECURITY'),
  product('inbox', 'xi-io: inbox', 'COMMUNICATIONS'),
  product('bins', 'xi-io: bins', 'KNOWLEDGE'),
  product('cadence', 'xi-io: Cadence', 'WORK'),
  product('benchmark', 'xi-io: benchmark', 'QUALITY'),
  product('publisher', 'xi-io: publisher', 'PUBLISHING'),
  product('dataforge', 'xi-io: dataforge', 'FORGE'),
  product('photoforge', 'xi-io: photoforge', 'FORGE'),
  product('vectorforge', 'xi-io: vectorforge', 'FORGE'),
  product('filmforge', 'xi-io: filmforge', 'FORGE'),
  product('lightforge', 'xi-io: lightforge', 'FORGE'),
  product('pdfforge', 'xi-io: pdfforge', 'FORGE'),
  product('effectforge', 'xi-io: effectforge', 'FORGE'),
  product('designeforge', 'xi-io: designeforge', 'FORGE'),
  product('wordforge', 'xi-io: wordforge', 'FORGE'),
  product('soundforge', 'xi-io: soundforge', 'FORGE'),
  product('gridforge', 'xi-io: gridforge', 'FORGE'),
  product('deckforge', 'xi-io: deckforge', 'FORGE'),
  product('cadforge', 'xi-io: cadforge', 'FORGE'),
  product('txtureforge', 'xi-io: txtureforge', 'FORGE'),
  product('solidforge', 'xi-io: solidforge', 'FORGE'),
  product('dev_forge', 'xi-io: Dev_forge', 'FORGE_SYSTEM', {
    lifecycle: 'STARTED_NOT_FINISHED',
    aliases: ['forge-anything'],
    troubleshooting_surface: Object.freeze({
      combines: Object.freeze([
        'xi-io:Dev_forge',
        'xi-io:ibal',
        '@xi-io/sdk',
        'xi-io:cli',
      ]),
      purpose: 'TROUBLESHOOT_BUILD_INSPECT_REPAIR_PRODUCT_LINE',
      forge_anything: 'ABSORBED_INTO_DEV_FORGE',
    }),
  }),
]);

export const XIIO_PRODUCT_LINEUP_BY_REF = Object.freeze(
  Object.fromEntries(XIIO_PRODUCT_LINEUP.map((entry) => [entry.product_ref, entry])),
);

export function resolveProductWindow(productRef) {
  const key = String(productRef || '').trim();
  const found = XIIO_PRODUCT_LINEUP_BY_REF[key];
  if (!found) throw new Error('XIIO_PRODUCT_NOT_STAMPED:' + key);
  return found;
}

export function productWindowStamp(productRef) {
  const entry = resolveProductWindow(productRef);
  return Object.freeze({
    schema: PRODUCT_WINDOW_CONTRACT,
    product_ref: entry.product_ref,
    label: entry.label,
    family: entry.family,
    lifecycle: entry.lifecycle,
    host: shared.host,
    frame_owner: shared.frame_owner,
    intermediary_template: shared.intermediary_template,
    project_management: shared.project_management,
    chat: shared.chat,
    frame_settings: shared.frame_settings,
    frame_controls: shared.frame_controls,
    product_settings_location: shared.product_settings_location,
    linux_surface: shared.linux_surface,
    empire_os_surface: shared.empire_os_surface,
    effect_authority: 0,
  });
}

export function compileProductWindowSession({
  product_ref,
  project_ref = null,
  chat_ref = null,
  launch_surface = 'LOCAL_LINUX',
} = {}) {
  const stamp = productWindowStamp(product_ref);
  if (!['LOCAL_LINUX', 'EMPIRE_OS'].includes(launch_surface)) {
    throw new Error('XIIO_PRODUCT_WINDOW_SURFACE_INVALID');
  }
  return Object.freeze({
    schema: 'xiio.product-window-session/v1',
    product: stamp,
    stage: 'INTERMEDIARY',
    launch_surface,
    project_ref,
    chat_ref,
    intermediary: Object.freeze({
      template: shared.intermediary_template,
      show_product_identity: true,
      show_project_manager: true,
      show_chat: true,
      show_recent_or_current_project: true,
      product_body_state: 'NOT_YET_MOUNTED',
      product_settings_visible_here: false,
    }),
    next: 'MOUNT_PRODUCT_BODY',
    authority: Object.freeze({
      effect_authority: 0,
      project_selected: Boolean(project_ref),
      chat_bound: Boolean(chat_ref),
    }),
  });
}

export function stampAllProducts() {
  return Object.freeze(XIIO_PRODUCT_LINEUP.map(({ product_ref }) => productWindowStamp(product_ref)));
}
