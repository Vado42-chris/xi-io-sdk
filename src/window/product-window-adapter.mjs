import {createBlackProductWindowSession,projectBlackProductWindowHost} from './black-product-window-session.mjs';

export const PRODUCT_WINDOW_ADAPTER_SCHEMA='xiio.studio.product-window-adapter/v1';
export const PRODUCT_WINDOW_COMPOSITION_SCHEMA='xiio.studio.product-window-composition/v1';

const nonempty=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim()};
const array=(v,k)=>{if(!Array.isArray(v)||v.length===0)throw new TypeError(k+'_REQUIRED');return Object.freeze(v.map(x=>nonempty(String(x),k)))};
const clone=v=>JSON.parse(JSON.stringify(v));

export function createProductWindowAdapter(input={}){
  const resource=input.resource||{},context=input.context||{},authority=input.authority||{},persistence=input.persistence||{},branding=input.branding||{};
  return Object.freeze({
    schema:PRODUCT_WINDOW_ADAPTER_SCHEMA,
    product_id:nonempty(input.product_id,'product_id'),
    body_id:nonempty(input.body_id,'body_id'),
    body_ref:nonempty(input.body_ref,'body_ref'),
    body_generation:nonempty(input.body_generation,'body_generation'),
    branding:Object.freeze({
      family:nonempty(branding.family,'branding.family'),
      chroma:nonempty(branding.chroma,'branding.chroma'),
      variant_ref:nonempty(branding.variant_ref,'branding.variant_ref')
    }),
    settings_scope:nonempty(input.settings_scope,'settings_scope'),
    domain_actions:array(input.domain_actions,'domain_actions'),
    resource:Object.freeze({
      resource_ref:nonempty(resource.resource_ref,'resource_ref'),
      opened_version_ref:nonempty(resource.opened_version_ref,'opened_version_ref'),
      current_version_ref:nonempty(resource.current_version_ref||resource.opened_version_ref,'current_version_ref'),
      content_digest:resource.content_digest==null?null:String(resource.content_digest),
      profile_id:nonempty(resource.profile_id,'profile_id'),
      source_lineage:Object.freeze(Array.isArray(resource.source_lineage)?clone(resource.source_lineage):[])
    }),
    context:Object.freeze({
      workspace_ref:nonempty(context.workspace_ref,'workspace_ref'),
      project_ref:context.project_ref==null?null:nonempty(context.project_ref,'project_ref'),
      domain_context_ref:context.domain_context_ref==null?null:nonempty(context.domain_context_ref,'domain_context_ref')
    }),
    authority:Object.freeze({
      principal_ref:nonempty(authority.principal_ref,'principal_ref'),
      device_ref:authority.device_ref==null?null:nonempty(authority.device_ref,'device_ref'),
      capability_refs:Object.freeze(Array.isArray(authority.capability_refs)?authority.capability_refs.map(String):[]),
      approval_ref:authority.approval_ref==null?null:nonempty(authority.approval_ref,'approval_ref'),
      lease_ref:authority.lease_ref==null?null:nonempty(authority.lease_ref,'lease_ref'),
      effect_ceiling:nonempty(authority.effect_ceiling||'NO_EFFECT','effect_ceiling')
    }),
    persistence:Object.freeze({
      save_operation_ref:nonempty(persistence.save_operation_ref,'save_operation_ref'),
      readback_operation_ref:nonempty(persistence.readback_operation_ref,'readback_operation_ref')
    }),
    studio_return_ref:nonempty(input.studio_return_ref,'studio_return_ref')
  });
}

export function composeProductWindow(adapter,{session_ref,window_ref,host_kind='studio_virtual'}={}){
  if(adapter?.schema!==PRODUCT_WINDOW_ADAPTER_SCHEMA)throw new TypeError('PRODUCT_WINDOW_ADAPTER_INVALID');
  const session=createBlackProductWindowSession({
    session_ref:nonempty(session_ref,'session_ref'),window_ref:nonempty(window_ref,'window_ref'),host_kind,
    product_id:adapter.product_id,resource:adapter.resource,context:adapter.context,authority:adapter.authority
  });
  return Object.freeze({
    schema:PRODUCT_WINDOW_COMPOSITION_SCHEMA,adapter,session,
    body:Object.freeze({id:adapter.body_id,ref:adapter.body_ref,generation:adapter.body_generation}),
    settings_scope:adapter.settings_scope,persistence:adapter.persistence,studio_return_ref:adapter.studio_return_ref
  });
}

export async function mountProductBody(composition,{mountBody,mountTarget}){
  if(composition?.schema!==PRODUCT_WINDOW_COMPOSITION_SCHEMA)throw new TypeError('PRODUCT_WINDOW_COMPOSITION_INVALID');
  if(typeof mountBody!=='function')throw new TypeError('PRODUCT_BODY_MOUNT_REQUIRED');
  const result=await mountBody(Object.freeze({
    product_id:composition.adapter.product_id,body_id:composition.body.id,body_ref:composition.body.ref,body_generation:composition.body.generation,
    branding:composition.adapter.branding,settings_scope:composition.settings_scope,resource:composition.session.resource,
    context:composition.session.context,authority:composition.session.authority,domain_actions:composition.adapter.domain_actions,
    persistence:composition.persistence,studio_return_ref:composition.studio_return_ref,mountTarget
  }));
  if(!result||result.product_id!==composition.adapter.product_id||result.body_id!==composition.body.id||result.body_ref!==composition.body.ref)throw new Error('PRODUCT_BODY_MOUNT_READBACK_MISMATCH');
  return Object.freeze(result);
}

export function projectProductHost(composition,{host_kind,window_ref}){
  if(composition?.schema!==PRODUCT_WINDOW_COMPOSITION_SCHEMA)throw new TypeError('PRODUCT_WINDOW_COMPOSITION_INVALID');
  return Object.freeze({...composition,session:projectBlackProductWindowHost(composition.session,{host_kind,window_ref})});
}

export function assertProductSwitchIsolation(previous,next){
  if(previous?.schema!==PRODUCT_WINDOW_COMPOSITION_SCHEMA||next?.schema!==PRODUCT_WINDOW_COMPOSITION_SCHEMA)throw new TypeError('PRODUCT_WINDOW_COMPOSITION_INVALID');
  if(previous.adapter.product_id===next.adapter.product_id)throw new Error('PRODUCT_SWITCH_REQUIRES_DISTINCT_PRODUCT');
  const leaks=[];
  if(previous.session.session_ref===next.session.session_ref)leaks.push('session_ref');
  if(previous.session.resource.resource_ref===next.session.resource.resource_ref)leaks.push('resource_ref');
  if(previous.settings_scope===next.settings_scope)leaks.push('settings_scope');
  if(previous.studio_return_ref===next.studio_return_ref)leaks.push('studio_return_ref');
  if(leaks.length)throw new Error('PRODUCT_CONTEXT_LEAK:'+leaks.join(','));
  return Object.freeze({ok:true,previous_product:previous.adapter.product_id,next_product:next.adapter.product_id});
}
