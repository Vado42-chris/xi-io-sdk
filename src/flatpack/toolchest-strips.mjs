const clone=v=>structuredClone(v);
const arr=v=>Array.isArray(v)?v:[];
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const uniq=(xs,k)=>{const s=new Set(xs);if(s.size!==xs.length)throw new TypeError('DUPLICATE_'+k);return xs;};

export const TOOLCHEST_STRIP_KINDS=Object.freeze(['NAVIGATION','CONTEXT_TOOLKIT','UTILITY_RAIL']);

export function compileToolchestStrip(input={}){
 const kind=text(input.kind,'STRIP_KIND').toUpperCase();
 if(!TOOLCHEST_STRIP_KINDS.includes(kind))throw new TypeError('STRIP_KIND_INVALID');
 const stripRef=text(input.strip_ref,'STRIP_REF');
 const userRef=text(input.user_ref,'USER_REF'),productRef=text(input.product_ref,'PRODUCT_REF');
 const components=arr(input.components).map((c,i)=>({
   component_ref:text(c.component_ref,'COMPONENT_REF'),role:text(c.role,'COMPONENT_ROLE'),
   capability_ref:c.capability_ref?text(c.capability_ref,'CAPABILITY_REF'):null,
   state_ref:c.state_ref?text(c.state_ref,'STATE_REF'):null,
   variables:clone(c.variables||{}),order:i
 }));
 uniq(components.map(x=>x.component_ref),'COMPONENT_REF');
 return Object.freeze({
   schema:'xiio.sdk.toolchest-strip/v1',strip_ref:stripRef,kind,user_ref:userRef,product_ref:productRef,
   components:Object.freeze(components),variables:Object.freeze(clone(input.variables||{})),
   contracts:Object.freeze({selection_ref:input.selection_ref||null,filter_ref:input.filter_ref||null,workspace_ref:input.workspace_ref||null}),
   effect_authority:0
 });
}

export function composeToolchestStrips(strips=[]){
 const rows=arr(strips);
 if(rows.length!==3)throw new TypeError('THREE_STRIPS_REQUIRED');
 uniq(rows.map(x=>x.strip_ref),'STRIP_REF');
 const kinds=uniq(rows.map(x=>x.kind),'STRIP_KIND');
 for(const k of TOOLCHEST_STRIP_KINDS)if(!kinds.includes(k))throw new TypeError('STRIP_KIND_MISSING:'+k);
 const capabilityOwners=new Map();
 for(const strip of rows)for(const c of strip.components){
   if(!c.capability_ref)continue;
   if(capabilityOwners.has(c.capability_ref))throw new TypeError('DUPLICATE_FUNCTIONALITY:'+c.capability_ref+':'+capabilityOwners.get(c.capability_ref)+':'+c.component_ref);
   capabilityOwners.set(c.capability_ref,c.component_ref);
 }
 const first=rows[0];
 for(const s of rows)if(s.user_ref!==first.user_ref||s.product_ref!==first.product_ref)throw new TypeError('STRIP_CONTEXT_DRIFT');
 return Object.freeze({
   schema:'xiio.sdk.toolchest-strip-composition/v1',
   user_ref:first.user_ref,product_ref:first.product_ref,
   strips:Object.freeze(rows.map(x=>x.strip_ref)),
   capability_owners:Object.freeze(Object.fromEntries(capabilityOwners)),
   contracts:Object.freeze({
     selection_ref:rows.map(x=>x.contracts.selection_ref).find(Boolean)||null,
     filter_ref:rows.map(x=>x.contracts.filter_ref).find(Boolean)||null,
     workspace_ref:rows.map(x=>x.contracts.workspace_ref).find(Boolean)||null
   }),
   hard:Object.freeze(['ONE_CAPABILITY_ONE_COMPONENT_OWNER','STRIPS_REFERENCE_SHARED_STATE','VISUAL_ADJACENCY!=FUNCTION_DUPLICATION']),
   effect_authority:0
 });
}
