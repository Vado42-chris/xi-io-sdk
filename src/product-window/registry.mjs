import { compileStudioRegistryIntake } from '../baseline/studio-registry-intake.mjs';
export const PRODUCT_WINDOW_SCHEMA = 'xiio.product-window-registry/v1';
export const PRODUCT_WINDOW_CONTRACT = 'xiio.product-window-contract/v1';
export const PRODUCT_WINDOW_TEMPLATE = 'XIIO_WHITE_LABEL_INTERMEDIARY';
const SHARED = Object.freeze({
  host:'HEX', intermediary_template:PRODUCT_WINDOW_TEMPLATE,
  frame_settings:Object.freeze(['BLACK_LEVEL']),
  frame_controls:Object.freeze(['MINIMIZE','MAXIMIZE_RESTORE','CLOSE']),
  product_settings_location:'INSIDE_PRODUCT_BODY',
  project_management:'REQUIRED',chat:'REQUIRED',
  linux_surface:'REQUIRED',empire_os_surface:'REQUIRED',effect_authority:0,
});
const required=(value,name)=>{if(typeof value!=='string'||!value.trim())throw new TypeError(name+'_REQUIRED');return value.trim();};
const own=(object,key,code='XIIO_PRODUCT_WINDOW_ACCESSOR_REFUSED')=>{
  if(!object||typeof object!=='object'||Array.isArray(object))throw new TypeError(code);
  const descriptor=Object.getOwnPropertyDescriptor(object,key);
  if(!descriptor||!Object.hasOwn(descriptor,'value'))throw new TypeError(code);
  return descriptor.value;
};
export function compileProductWindowRegistry(input={}){
  const studio_registry=own(input,'studio_registry');
  const product_catalog=own(input,'product_catalog');
  const intake=compileStudioRegistryIntake(studio_registry);
  if(!intake.counted_from_canonical_registry||!intake.registry_count_consistent||
     !intake.source.denominator_ref||!intake.denominator_generation)
    throw new Error('XIIO_PRODUCT_WINDOW_STUDIO_REGISTRY_UNBOUND');
  if(!Array.isArray(product_catalog))throw new TypeError('XIIO_PRODUCT_CATALOG_REQUIRED');
  const known=new Set(intake.member_ids),refs=new Set(),ids=new Set(),products=[];
  for(const candidate of product_catalog){
    const studio_product_id=required(own(candidate,'studio_product_id'),'STUDIO_PRODUCT_ID');
    const product_ref=required(own(candidate,'product_ref'),'PRODUCT_REF');
    if(!known.has(studio_product_id))throw new Error('XIIO_PRODUCT_NOT_STUDIO_MEMBER:'+studio_product_id);
    if(refs.has(product_ref)||ids.has(studio_product_id))throw new Error('XIIO_PRODUCT_CATALOG_DUPLICATE');
    refs.add(product_ref);ids.add(studio_product_id);
    products.push(Object.freeze({
      product_ref,studio_product_id,
      label:required(own(candidate,'label'),'PRODUCT_LABEL'),
      family:required(own(candidate,'family'),'PRODUCT_FAMILY'),
      lifecycle:Object.hasOwn(candidate,'lifecycle')&&typeof own(candidate,'lifecycle')==='string'&&own(candidate,'lifecycle').trim()?own(candidate,'lifecycle').trim():'UNKNOWN',
      body_owner:Object.hasOwn(candidate,'body_owner')&&typeof own(candidate,'body_owner')==='string'&&own(candidate,'body_owner').trim()?own(candidate,'body_owner').trim():null,
      shared_window:SHARED,
    }));
  }
  const missing_member_ids=intake.member_ids.filter(id=>!ids.has(id));
  return Object.freeze({
    schema:PRODUCT_WINDOW_SCHEMA,products:Object.freeze(products),
    denominator_generation:intake.denominator_generation,relationship_generation:intake.relationship_generation,
    source:intake.source,relationship_complete:intake.relationship_complete,
    state:missing_member_ids.length||intake.unknown_membership_ids.length||!intake.relationship_complete
      ?'PARTIAL_UNVERIFIED':'SUPPLIED_UNVERIFIED',
    missing_member_ids:Object.freeze(missing_member_ids),
    unknown_membership_ids:Object.freeze([...intake.unknown_membership_ids]),
    effect_authority:0,
  });
}
export function resolveProductWindow(productRef,options){
  const key=required(productRef,'PRODUCT_REF');
  const found=compileProductWindowRegistry(options).products.find(x=>x.product_ref===key);
  if(!found)throw new Error('XIIO_PRODUCT_NOT_STAMPED:'+key);
  return found;
}
export function productWindowStamp(productRef,options){
  const item=resolveProductWindow(productRef,options);
  return Object.freeze({schema:PRODUCT_WINDOW_CONTRACT,product_ref:item.product_ref,
    studio_product_id:item.studio_product_id,label:item.label,family:item.family,
    lifecycle:item.lifecycle,body_owner:item.body_owner,...SHARED});
}
export function compileProductWindowSession({
  product_ref,project_ref=null,chat_ref=null,launch_surface=null,launch_surfaces,
  studio_registry,product_catalog,
}={}){
  const stamp=productWindowStamp(product_ref,{studio_registry,product_catalog});
  if(!Array.isArray(launch_surfaces)||!launch_surfaces.length)throw new Error('XIIO_PRODUCT_WINDOW_SURFACES_UNBOUND');
  const registered=launch_surfaces.map((surface)=>required(surface,'LAUNCH_SURFACE'));
  if(new Set(registered).size!==registered.length)throw new Error('XIIO_PRODUCT_WINDOW_SURFACES_DUPLICATE');
  const selected=launch_surface==null?registered[0]:required(launch_surface,'LAUNCH_SURFACE');
  if(!registered.includes(selected))throw new Error('XIIO_PRODUCT_WINDOW_SURFACE_INVALID');
  return Object.freeze({
    schema:'xiio.product-window-session/v1',product:stamp,stage:'INTERMEDIARY',
    launch_surface:selected,launch_surfaces:Object.freeze([...registered]),project_ref,chat_ref,
    intermediary:Object.freeze({
      template:SHARED.intermediary_template,show_product_identity:true,
      show_project_manager:true,show_chat:true,show_recent_or_current_project:true,
      product_body_state:'NOT_YET_MOUNTED',product_settings_visible_here:false,
    }),
    next:'MOUNT_PRODUCT_BODY',
    authority:Object.freeze({effect_authority:0,project_selected:Boolean(project_ref),chat_bound:Boolean(chat_ref)}),
  });
}
export function stampAllProducts(options){
  return Object.freeze(compileProductWindowRegistry(options).products.map(x=>productWindowStamp(x.product_ref,options)));
}
