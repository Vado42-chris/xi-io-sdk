import {createBlackProductWindowSession,projectBlackProductWindowHost,markBlackProductWindowDirty,beginBlackProductWindowWrite,recordBlackProductWindowWriteOutcome,reconcileBlackProductWindowReadback} from './black-product-window-session.mjs';

export const PRODUCT_WINDOW_ADAPTER_SCHEMA='xiio.studio.product-window-adapter/v1';
export const PRODUCT_WINDOW_COMPOSITION_SCHEMA='xiio.studio.product-window-composition/v1';

const nonempty=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim()};
const array=(v,k)=>{if(!Array.isArray(v)||v.length===0)throw new TypeError(k+'_REQUIRED');return Object.freeze(v.map(x=>nonempty(String(x),k)))};
const clone=v=>JSON.parse(JSON.stringify(v));
const bodyPort=(composition,port)=>{
  if(composition?.schema!==PRODUCT_WINDOW_COMPOSITION_SCHEMA)throw new TypeError('PRODUCT_WINDOW_COMPOSITION_INVALID');
  if(!port||typeof port!=='object')throw new TypeError('PRODUCT_BODY_PORT_REQUIRED');
  if(typeof port.mount!=='function')throw new TypeError('PRODUCT_BODY_MOUNT_PORT_REQUIRED');
  if(typeof port.perform!=='function')throw new TypeError('PRODUCT_BODY_PERFORM_PORT_REQUIRED');
  const entry=nonempty(port.entry_ref,'body_port.entry_ref');
  const generation=nonempty(port.generation,'body_port.generation');
  if(!composition.body.ref.endsWith(entry))throw new Error('PRODUCT_BODY_PORT_REF_MISMATCH');
  if(composition.body.generation!==generation)throw new Error('PRODUCT_BODY_PORT_GENERATION_MISMATCH');
  return port;
};
const hostPort=port=>{
  if(!port||typeof port!=='object')throw new TypeError('PRODUCT_HOST_PORT_REQUIRED');
  for(const name of ['save','readback','close','reopen','returnToStudio'])if(typeof port[name]!=='function')throw new TypeError('PRODUCT_HOST_'+name.toUpperCase()+'_PORT_REQUIRED');
  return port;
};
const activeSession=(composition,session)=>{
  const value=session||composition?.session;
  if(!value||value.product_id!==composition?.adapter?.product_id)throw new Error('PRODUCT_SESSION_IDENTITY_MISMATCH');
  if(value.context?.workspace_ref!==composition.session.context.workspace_ref)throw new Error('PRODUCT_SESSION_WORKSPACE_MISMATCH');
  if(value.resource?.resource_ref!==composition.session.resource.resource_ref)throw new Error('PRODUCT_SESSION_RESOURCE_MISMATCH');
  return value;
};
const mountedIdentity=(composition,mounted)=>{
  if(!mounted||mounted.product_id!==composition.adapter.product_id||mounted.body_id!==composition.body.id||mounted.body_ref!==composition.body.ref||mounted.mounted!==true)throw new Error('PRODUCT_BODY_MOUNT_IDENTITY_REQUIRED');
  return mounted;
};

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

export async function mountExecutableProductBody(composition,{bodyPort:port,mountTarget=null,shell=null,session=null}={}){
  const executable=bodyPort(composition,port);
  const current=activeSession(composition,session);
  const mounted=await executable.mount(Object.freeze({
    shell,mountTarget,session:current,context:current.context,resource:current.resource,
    permissions:current.authority,
    tokens:Object.freeze({branding:composition.adapter.branding,settings_scope:composition.settings_scope,domain_actions:composition.adapter.domain_actions})
  }));
  if(!mounted||mounted.component_ref!==executable.entry_ref)throw new Error('PRODUCT_BODY_EXECUTABLE_MOUNT_READBACK_MISMATCH');
  if(mounted.component_generation!=null&&mounted.component_generation!==executable.generation)throw new Error('PRODUCT_BODY_EXECUTABLE_GENERATION_READBACK_MISMATCH');
  return Object.freeze({
    product_id:composition.adapter.product_id,body_id:composition.body.id,body_ref:composition.body.ref,
    component_ref:executable.entry_ref,component_generation:executable.generation,mounted:true,readback:mounted
  });
}

export async function performExecutableProductOperation(composition,{bodyPort:port,mounted,operation,args={},mapping=null,session=null}={}){
  const executable=bodyPort(composition,port);
  mountedIdentity(composition,mounted);
  const current=activeSession(composition,session);
  const result=await executable.perform(Object.freeze({
    operation:nonempty(operation,'operation'),args,mapping,session:current,resource:current.resource
  }));
  if(!result||typeof result.operation_ref!=='string'||!result.operation_ref.trim())throw new Error('PRODUCT_OPERATION_REF_REQUIRED');
  if(typeof result.attempt_ref!=='string'||!result.attempt_ref.trim())throw new Error('PRODUCT_ATTEMPT_REF_REQUIRED');
  if(result.working_version_ref==null)throw new Error('PRODUCT_WORKING_VERSION_REQUIRED');
  if(typeof result.content_digest!=='string'||!result.content_digest.trim())throw new Error('PRODUCT_CONTENT_DIGEST_REQUIRED');
  return Object.freeze({...result});
}

export async function persistExecutableProductOperation(composition,{operationResult,hostPort:port,session=null}={}){
  if(composition?.schema!==PRODUCT_WINDOW_COMPOSITION_SCHEMA)throw new TypeError('PRODUCT_WINDOW_COMPOSITION_INVALID');
  const host=hostPort(port);
  const current=activeSession(composition,session);
  if(!operationResult||typeof operationResult!=='object')throw new TypeError('PRODUCT_OPERATION_RESULT_REQUIRED');
  const operation_ref=nonempty(operationResult.operation_ref,'operation_ref');
  const attempt_ref=nonempty(operationResult.attempt_ref,'attempt_ref');
  const working_version_ref=nonempty(String(operationResult.working_version_ref),'working_version_ref');
  const content_digest=nonempty(operationResult.content_digest,'content_digest');
  let nextSession=markBlackProductWindowDirty(current,{working_version_ref,working_digest:content_digest});
  nextSession=beginBlackProductWindowWrite(nextSession,{operation_ref,attempt_ref,expected_version_ref:current.resource.current_version_ref});
  if(nextSession.state==='CONFLICT')return Object.freeze({ok:false,session:nextSession,write:null,readback:null,first_red:nextSession.last_error});
  let write;
  try{
    write=await host.save({session:nextSession,body_result:operationResult});
  }catch(error){
    nextSession=recordBlackProductWindowWriteOutcome(nextSession,{operation_ref,attempt_ref,outcome:'outcome_unknown',error:String(error?.message||error)});
    return Object.freeze({ok:false,session:nextSession,write:null,readback:null,first_red:nextSession.last_error});
  }
  const outcome=write?.outcome;
  if(!['verified','written_unverified','failed_no_effect','outcome_unknown'].includes(outcome))throw new Error('PRODUCT_HOST_WRITE_OUTCOME_INVALID');
  nextSession=recordBlackProductWindowWriteOutcome(nextSession,{
    operation_ref,attempt_ref,outcome,new_version_ref:write?.version_ref??null,content_digest:write?.content_digest??null,error:write?.error??null
  });
  if(nextSession.state!=='WRITTEN_UNVERIFIED')return Object.freeze({ok:false,session:nextSession,write,readback:null,first_red:nextSession.last_error});
  let readback;
  try{
    readback=await host.readback({resource_ref:nextSession.resource.resource_ref});
  }catch(error){
    return Object.freeze({ok:false,session:nextSession,write,readback:null,first_red:String(error?.message||error)});
  }
  try{
    nextSession=reconcileBlackProductWindowReadback(nextSession,readback);
  }catch(error){
    return Object.freeze({ok:false,session:nextSession,write,readback,first_red:String(error?.message||error)});
  }
  return Object.freeze({ok:nextSession.state==='VERIFIED',session:nextSession,write,readback,first_red:nextSession.state==='VERIFIED'?null:nextSession.last_error});
}

export async function reopenExecutableProduct(composition,{session,hostPort:port}={}){
  if(composition?.schema!==PRODUCT_WINDOW_COMPOSITION_SCHEMA)throw new TypeError('PRODUCT_WINDOW_COMPOSITION_INVALID');
  if(session?.state!=='VERIFIED')throw new Error('PRODUCT_REOPEN_REQUIRES_VERIFIED_SESSION');
  const host=hostPort(port);
  await host.close({session});
  const reopened=await host.reopen({session,resource_ref:session.resource.resource_ref});
  if(!reopened||reopened.resource_ref!==session.resource.resource_ref)throw new Error('PRODUCT_REOPEN_RESOURCE_MISMATCH');
  if(reopened.version_ref!==session.resource.current_version_ref)throw new Error('PRODUCT_REOPEN_VERSION_MISMATCH');
  if(reopened.content_digest!==session.resource.content_digest)throw new Error('PRODUCT_REOPEN_DIGEST_MISMATCH');
  return Object.freeze({...reopened});
}

export async function returnExecutableProductToStudio(composition,{session,hostPort:port}={}){
  if(composition?.schema!==PRODUCT_WINDOW_COMPOSITION_SCHEMA)throw new TypeError('PRODUCT_WINDOW_COMPOSITION_INVALID');
  if(session?.state!=='VERIFIED')throw new Error('PRODUCT_RETURN_REQUIRES_VERIFIED_SESSION');
  return hostPort(port).returnToStudio({session,studio_return_ref:composition.studio_return_ref});
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
