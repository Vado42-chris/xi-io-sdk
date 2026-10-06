const clone=v=>structuredClone(v);
const arr=v=>Array.isArray(v)?v:[];
const req=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};

export function declareAiProviderAdapter(input={}){
 return Object.freeze({
  schema:'xiio.sdk.ai-provider-adapter/v1',
  provider_ref:req(input.provider_ref,'PROVIDER_REF'),
  plugin_ref:req(input.plugin_ref,'PLUGIN_REF'),
  capabilities:Object.freeze(arr(input.capabilities).map(String)),
  transports:Object.freeze(arr(input.transports).map(String)),
  auth_ref:input.auth_ref||null,
  effect_ceiling:input.effect_ceiling||'NO_EFFECT',
  variables:Object.freeze(clone(input.variables||{}))
 });
}
export function routeConversationTurn({adapters=[],request={}}={}){
 const required=new Set(arr(request.required_capabilities));
 const eligible=arr(adapters).filter(a=>[...required].every(x=>a.capabilities.includes(x)));
 const selected=request.provider_ref?eligible.find(a=>a.provider_ref===request.provider_ref):eligible[0];
 if(!selected) return {schema:'xiio.sdk.ai-provider-route/v1',state:'UNROUTABLE',typed_need:'provider_with_capabilities',required_capabilities:[...required],effect_authority:0};
 return {schema:'xiio.sdk.ai-provider-route/v1',state:'ROUTED',provider_ref:selected.provider_ref,plugin_ref:selected.plugin_ref,conversation_ref:req(request.conversation_ref,'CONVERSATION_REF'),surface_ref:req(request.surface_ref,'SURFACE_REF'),payload_ref:req(request.payload_ref,'PAYLOAD_REF'),required_capabilities:[...required],effect_authority:0};
}
export function swapConversationProvider({adapters=[],current_route,next_provider_ref}={}){
 if(!current_route||current_route.state!=='ROUTED')throw new TypeError('CURRENT_ROUTE_REQUIRED');
 return routeConversationTurn({adapters,request:{provider_ref:next_provider_ref,conversation_ref:current_route.conversation_ref,surface_ref:current_route.surface_ref,payload_ref:current_route.payload_ref,required_capabilities:current_route.required_capabilities}});
}
