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


const deliveryText = (value, code) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
};

const deliveryObject = (value, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
};

const ownDeliveryValue = (object, key, code) => {
  deliveryObject(object, code);
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error(code);
  return descriptor.value;
};

const optionalDeliveryValue = (object, key, code) => {
  deliveryObject(object, code);
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) throw new Error(code);
  return descriptor.value;
};

function compilePublisherWindowBinding({ product_ref, publisher_recipe, sdk_registry } = {}) {
  const recipe = deliveryObject(publisher_recipe, 'XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_REQUIRED');
  if (ownDeliveryValue(recipe, 'schema', 'XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_INVALID') !== 'xiio.publisher.template-recipe/v1') {
    throw new Error('XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_INVALID');
  }
  if (ownDeliveryValue(recipe, 'ready', 'XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_INVALID') !== true) {
    throw new Error('XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_NOT_READY');
  }
  const recipeProduct = deliveryText(ownDeliveryValue(recipe, 'product_ref', 'XIIO_PRODUCT_WINDOW_PUBLISHER_PRODUCT_REQUIRED'), 'XIIO_PRODUCT_WINDOW_PUBLISHER_PRODUCT_REQUIRED');
  if (recipeProduct !== product_ref) throw new Error('XIIO_PRODUCT_WINDOW_PUBLISHER_PRODUCT_MISMATCH');
  const recipeRef = deliveryText(ownDeliveryValue(recipe, 'recipe_id', 'XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_REF_REQUIRED'), 'XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_REF_REQUIRED');
  const recipeGeneration = deliveryText(ownDeliveryValue(recipe, 'generation', 'XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_GENERATION_REQUIRED'), 'XIIO_PRODUCT_WINDOW_PUBLISHER_RECIPE_GENERATION_REQUIRED');
  const sdkGeneration = deliveryText(ownDeliveryValue(recipe, 'sdk_generation', 'XIIO_PRODUCT_WINDOW_PUBLISHER_SDK_GENERATION_REQUIRED'), 'XIIO_PRODUCT_WINDOW_PUBLISHER_SDK_GENERATION_REQUIRED');
  const composition = ownDeliveryValue(recipe, 'composition', 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPOSITION_REQUIRED');
  if (!Array.isArray(composition) || composition.length === 0) throw new Error('XIIO_PRODUCT_WINDOW_PUBLISHER_COMPOSITION_REQUIRED');

  const registry = deliveryObject(sdk_registry, 'XIIO_PRODUCT_WINDOW_SDK_REGISTRY_REQUIRED');
  const components = composition.map((part, index) => {
    const row = deliveryObject(part, 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID');
    const componentRef = deliveryText(ownDeliveryValue(row, 'component_ref', 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID'), 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID');
    const uuid = deliveryText(ownDeliveryValue(row, 'uuid', 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID'), 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID');
    const specifier = deliveryText(ownDeliveryValue(row, 'specifier', 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID'), 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID');
    const role = deliveryText(ownDeliveryValue(row, 'role', 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID'), 'XIIO_PRODUCT_WINDOW_PUBLISHER_COMPONENT_INVALID');
    const descriptor = Object.getOwnPropertyDescriptor(registry, componentRef);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED');
    const registered = deliveryObject(descriptor.value, 'XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED');
    const registeredUuid = deliveryText(ownDeliveryValue(registered, 'uuid', 'XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED'), 'XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED');
    const registeredSpecifier = deliveryText(ownDeliveryValue(registered, 'specifier', 'XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED'), 'XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED');
    const registeredGeneration = deliveryText(ownDeliveryValue(registered, 'generation', 'XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED'), 'XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED');
    const interactions = ownDeliveryValue(registered, 'interactions', 'XIIO_PRODUCT_WINDOW_SDK_INTERACTION_CONTRACT_MISSING');
    if (registeredUuid !== uuid || registeredSpecifier !== specifier || registeredGeneration !== sdkGeneration) {
      throw new Error('XIIO_PRODUCT_WINDOW_SDK_COMPONENT_BINDING_UNVERIFIED');
    }
    if (!Array.isArray(interactions) || !interactions.every((value) => typeof value === 'string' && value.trim().length > 0)) {
      throw new Error('XIIO_PRODUCT_WINDOW_SDK_INTERACTION_CONTRACT_MISSING');
    }
    return Object.freeze({
      order: index + 1,
      component_ref: componentRef,
      uuid,
      specifier,
      role,
      interactions: Object.freeze([...interactions]),
    });
  });

  const variantsRaw = optionalDeliveryValue(recipe, 'variants', 'XIIO_PRODUCT_WINDOW_PUBLISHER_VARIANTS_INVALID');
  if (variantsRaw !== undefined && (!variantsRaw || typeof variantsRaw !== 'object' || Array.isArray(variantsRaw))) {
    throw new Error('XIIO_PRODUCT_WINDOW_PUBLISHER_VARIANTS_INVALID');
  }
  const accentDescriptor = variantsRaw ? Object.getOwnPropertyDescriptor(variantsRaw, 'accent_token') : null;
  if (accentDescriptor && !Object.hasOwn(accentDescriptor, 'value')) throw new Error('XIIO_PRODUCT_WINDOW_PUBLISHER_VARIANTS_INVALID');
  const accentToken = accentDescriptor
    ? deliveryText(accentDescriptor.value, 'XIIO_PRODUCT_WINDOW_CHROMA_TOKEN_INVALID')
    : null;

  const brandRaw = optionalDeliveryValue(recipe, 'brand_binding', 'XIIO_PRODUCT_WINDOW_BRAND_BINDING_INVALID');
  let brand = null;
  if (brandRaw != null) {
    const binding = deliveryObject(brandRaw, 'XIIO_PRODUCT_WINDOW_BRAND_BINDING_INVALID');
    brand = Object.freeze({
      ref: deliveryText(ownDeliveryValue(binding, 'ref', 'XIIO_PRODUCT_WINDOW_BRAND_BINDING_INVALID'), 'XIIO_PRODUCT_WINDOW_BRAND_BINDING_INVALID'),
      generation: deliveryText(ownDeliveryValue(binding, 'generation', 'XIIO_PRODUCT_WINDOW_BRAND_BINDING_INVALID'), 'XIIO_PRODUCT_WINDOW_BRAND_BINDING_INVALID'),
    });
  }
  if (accentToken && !brand) throw new Error('XIIO_PRODUCT_WINDOW_BRAND_BINDING_REQUIRED');

  return Object.freeze({
    state: 'SUPPLIED_UNVERIFIED',
    recipe_ref: recipeRef,
    recipe_generation: recipeGeneration,
    product_ref: recipeProduct,
    sdk_generation: sdkGeneration,
    components: Object.freeze(components),
    component_refs: Object.freeze(components.map((row) => row.component_ref)),
    chroma: Object.freeze({
      accent_token: accentToken,
      brand_ref: brand?.ref ?? null,
      brand_generation: brand?.generation ?? null,
    }),
  });
}

export function productWindowPublisherDeliveryStage(input = {}) {
  const body = productWindowProductStage(input);
  const publisher = compilePublisherWindowBinding({
    product_ref: body.product.product_ref,
    publisher_recipe: input.publisher_recipe,
    sdk_registry: input.sdk_registry,
  });
  return Object.freeze({
    ...body,
    schema: 'xiio.product-window-delivery/v1',
    publisher,
    delivery: Object.freeze({
      renderer: 'BROWSER_CAPABLE_WINDOW',
      state: 'SUPPLIED_UNVERIFIED',
      target_adapter: body.launch_surface,
    }),
    authority: Object.freeze({
      ...body.authority,
      effect_authority: 0,
      publisher_recipe_authority: false,
      sdk_component_authority: false,
      brand_truth_authority: false,
    }),
    hard: Object.freeze([
      'PUBLISHER_RECIPE != WINDOW_AUTHORITY',
      'SDK_COMPONENT_BINDING != EFFECT_AUTHORITY',
      'BRAND_REF != BRAND_TRUTH',
      'WINDOW_RENDER != RUNNING_NODE',
      'SUPPLIED_UNVERIFIED != INSTALLED',
    ]),
  });
}
