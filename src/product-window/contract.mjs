import { compileProductWindowSession, productWindowStamp } from './registry.mjs';

export const PRODUCT_WINDOW_STAGES = Object.freeze([
  'LAUNCH',
  'INTERMEDIARY',
  'PRODUCT_BODY',
]);

export function productWindowIntermediary(input = {}) {
  return compileProductWindowSession(input);
}

export function productWindowProductStage({
  product_ref,
  project_ref,
  chat_ref,
  body_ref,
  launch_surface = null,
  launch_surfaces,
  studio_registry,
  product_catalog,
} = {}) {
  const session = compileProductWindowSession({ product_ref, project_ref, chat_ref, launch_surface, launch_surfaces, studio_registry, product_catalog });
  const stamp = session.product;
  if (!body_ref || typeof body_ref !== 'string') throw new Error('XIIO_PRODUCT_BODY_REF_REQUIRED');
  if (!project_ref || typeof project_ref !== 'string') throw new Error('XIIO_PRODUCT_PROJECT_REF_REQUIRED');
  if (!chat_ref || typeof chat_ref !== 'string') throw new Error('XIIO_PRODUCT_CHAT_REF_REQUIRED');
  return Object.freeze({
    schema: 'xiio.product-window-session/v1',
    product: stamp,
    stage: 'PRODUCT_BODY',
    launch_surface: session.launch_surface,
    launch_surfaces: session.launch_surfaces,
    project_ref,
    chat_ref,
    body_ref,
    window: Object.freeze({
      black_level: 'SHARED_FRAME_SETTING',
      controls: stamp.frame_controls,
      product_settings_location: 'INSIDE_PRODUCT_BODY',
    }),
    project_management: 'SUPPLIED_UNVERIFIED',
    chat: 'SUPPLIED_UNVERIFIED',
    authority: Object.freeze({
      effect_authority: 0,
      body_mounted: false,
    }),
  });
}
