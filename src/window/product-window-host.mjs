import {
  composeProductWindow,
  mountExecutableProductBody,
  performExecutableProductOperation,
  persistExecutableProductOperation,
  reopenExecutableProduct,
  returnExecutableProductToStudio,
  assertProductSwitchIsolation,
} from './product-window-adapter.mjs';

export const PRODUCT_WINDOW_HOST_SCHEMA='xiio.studio.product-window-host/v1';
export const PRODUCT_WINDOW_RECEIVER_SCHEMA='xiio.studio.product-window-receiver/v1';

const nonempty=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim()};
const fn=(v,k)=>{if(typeof v!=='function')throw new TypeError(k+'_REQUIRED');return v};
const safeSession=session=>session?Object.freeze({
  session_ref:session.session_ref,
  window_ref:session.window_ref,
  host_kind:session.host_kind,
  product_id:session.product_id,
  state:session.state,
  resource:Object.freeze({...session.resource}),
  context:Object.freeze({...session.context}),
  authority:Object.freeze({
    principal_ref:session.authority?.principal_ref??null,
    effect_ceiling:session.authority?.effect_ceiling??null,
    capability_refs:Object.freeze([...(session.authority?.capability_refs||[])])
  }),
  last_error:session.last_error??null,
}):null;

export function createProductWindowHost({mountTarget,onState=()=>{}}={}){
  const notify=fn(onState,'ON_STATE');
  let active=null;
  let previous=null;

  const snapshot=()=>Object.freeze({
    schema:PRODUCT_WINDOW_HOST_SCHEMA,
    active:active?Object.freeze({
      product_id:active.composition.adapter.product_id,
      body_id:active.composition.body.id,
      body_ref:active.composition.body.ref,
      body_generation:active.composition.body.generation,
      mounted:Boolean(active.mounted?.mounted),
      session:safeSession(active.session),
    }):null,
    previous_product_id:previous?.composition?.adapter?.product_id??null,
  });
  const publish=(event,detail={})=>{
    const value=Object.freeze({event,...detail,snapshot:snapshot()});
    notify(value);
    return value;
  };

  async function openComposition({
    composition,bodyPort,hostPort,shell=null,
  }={}){
    if(!composition?.adapter||!composition?.session)throw new TypeError('PRODUCT_WINDOW_COMPOSITION_REQUIRED');
    if(active){
      if(!['CLEAN','VERIFIED'].includes(active.session.state))throw new Error('PRODUCT_SWITCH_DIRTY_SESSION_REFUSED');
      if(active.composition.adapter.product_id!==composition.adapter.product_id){
        assertProductSwitchIsolation(active.composition,composition);
      }
    }
    const mounted=await mountExecutableProductBody(composition,{bodyPort,mountTarget,shell,session:composition.session});
    previous=active;
    active={composition,mounted,session:composition.session,bodyPort,hostPort};
    publish('PRODUCT_MOUNTED',{
      product_id:composition.adapter.product_id,
      body_ref:composition.body.ref,
      body_generation:composition.body.generation,
    });
    return snapshot();
  }

  async function open({
    adapter,bodyPort,hostPort,
    session_ref,window_ref,host_kind='studio_virtual',shell=null,
  }={}){
    const composition=composeProductWindow(adapter,{
      session_ref:nonempty(session_ref,'session_ref'),
      window_ref:nonempty(window_ref,'window_ref'),
      host_kind,
    });
    return openComposition({composition,bodyPort,hostPort,shell});
  }

  async function performAndSave({operation,args={},mapping=null}={}){
    if(!active)throw new Error('PRODUCT_WINDOW_NOT_MOUNTED');
    const operationResult=await performExecutableProductOperation(active.composition,{
      bodyPort:active.bodyPort,
      mounted:active.mounted,
      operation:nonempty(operation,'operation'),
      args,mapping,
      session:active.session,
    });
    const persisted=await persistExecutableProductOperation(active.composition,{
      operationResult,
      hostPort:active.hostPort,
      session:active.session,
    });
    active={...active,session:persisted.session};
    publish(persisted.ok?'PRODUCT_SAVE_VERIFIED':'PRODUCT_SAVE_BLOCKED',{
      product_id:active.composition.adapter.product_id,
      operation_ref:operationResult.operation_ref,
      attempt_ref:operationResult.attempt_ref,
      first_red:persisted.first_red??null,
    });
    return Object.freeze({operation:operationResult,persistence:persisted,snapshot:snapshot()});
  }

  async function reopen(){
    if(!active)throw new Error('PRODUCT_WINDOW_NOT_MOUNTED');
    const reopened=await reopenExecutableProduct(active.composition,{
      session:active.session,
      hostPort:active.hostPort,
    });
    publish('PRODUCT_REOPEN_VERIFIED',{
      product_id:active.composition.adapter.product_id,
      resource_ref:reopened.resource_ref,
      version_ref:reopened.version_ref,
    });
    return Object.freeze({reopened,snapshot:snapshot()});
  }

  async function returnToStudio(){
    if(!active)throw new Error('PRODUCT_WINDOW_NOT_MOUNTED');
    const result=await returnExecutableProductToStudio(active.composition,{
      session:active.session,
      hostPort:active.hostPort,
    });
    publish('PRODUCT_STUDIO_RETURN_VERIFIED',{
      product_id:active.composition.adapter.product_id,
      studio_return_ref:active.composition.studio_return_ref,
    });
    return Object.freeze({result,snapshot:snapshot()});
  }

  return Object.freeze({
    schema:PRODUCT_WINDOW_HOST_SCHEMA,
    open,openComposition,performAndSave,reopen,returnToStudio,
    snapshot,
  });
}

export function installStudioProductWindowReceiver({
  globalObject=globalThis,
  mountTarget='#productWindowHost',
  onState=()=>{},
}={}){
  if(globalObject.XIIO_STUDIO_PRODUCT_WINDOW_RECEIVER?.schema===PRODUCT_WINDOW_RECEIVER_SCHEMA){
    return globalObject.XIIO_STUDIO_PRODUCT_WINDOW_RECEIVER;
  }
  const host=createProductWindowHost({mountTarget,onState});
  const receiver=Object.freeze({
    schema:PRODUCT_WINDOW_RECEIVER_SCHEMA,
    open:host.open,
    openComposition:host.openComposition,
    performAndSave:host.performAndSave,
    reopen:host.reopen,
    returnToStudio:host.returnToStudio,
    snapshot:host.snapshot,
  });
  Object.defineProperty(globalObject,'XIIO_STUDIO_PRODUCT_WINDOW_RECEIVER',{
    value:receiver,writable:false,configurable:true,enumerable:true
  });
  return receiver;
}
