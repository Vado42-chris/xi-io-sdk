// Canonical lifecycle vocabulary shared by producer bindings and read-only UI projections.
export const PRODUCT_ENTITLEMENT_STATES=Object.freeze(['ACTIVE','PENDING','SUSPENDED','REVOKED','EXPIRED']);
export const PRODUCT_ENTITLEMENT_SCHEMA='xiio.sdk.product-entitlement/v1';
export const ENTITLEMENT_TIER=Object.freeze({FREE:'free',ORCHESTRATED:'orchestrated'});
export const PRODUCT_CAPABILITIES=Object.freeze([
 'forms','documents','spreadsheets','code_editor','vector_surface','raster_surface','local_storage','export',
 'ai','ack','orchestration','scheduled_work'
]);
const FREE=new Set(['forms','documents','spreadsheets','code_editor','vector_surface','raster_surface','local_storage','export']);
const ORCHESTRATED=new Set(PRODUCT_CAPABILITIES);
const ORCHESTRATION=new Set(['ai','ack','orchestration','scheduled_work']);
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
function capabilities(values){
 if(!Array.isArray(values))throw new TypeError('required_capabilities_REQUIRED');
 const out=[...new Set(values.map(v=>text(v,'capability')))];for(const v of out)if(!PRODUCT_CAPABILITIES.includes(v))throw new TypeError('CAPABILITY_UNKNOWN:'+v);return out.sort();
}
export function compileProductEntitlement({product_ref,tier,required_capabilities=[]}={}){
 const product=text(product_ref,'product_ref'),required=capabilities(required_capabilities);
 if(!Object.values(ENTITLEMENT_TIER).includes(tier))throw new TypeError('ENTITLEMENT_TIER_INVALID');
 const admitted=tier===ENTITLEMENT_TIER.FREE?FREE:ORCHESTRATED;
 const withheld=required.filter(x=>!admitted.has(x));
 const paid_orchestration_required=required.some(x=>ORCHESTRATION.has(x));
 return Object.freeze({
  schema:PRODUCT_ENTITLEMENT_SCHEMA,product_ref:product,tier,
  required_capabilities:Object.freeze(required),withheld_capabilities:Object.freeze(withheld),
  admitted:withheld.length===0,
  paid_orchestration_required,
  free_software_capability_required:required.some(x=>!ORCHESTRATION.has(x)),
  next:withheld.length?'UPGRADE_OR_REMOVE_ORCHESTRATION_REQUIREMENT':'CONTINUE_TO_RATE_BUDGET_AND_EFFECT_GATES',
  billing_commit_allowed:false,provider_attempt_allowed:false,effect_authority:false,provider_effect:false,
  hard:Object.freeze([
   'FREE_TIER_IS_WHOLE_TOOL_NOT_DEMO',
   'PAID_TIER_UNLOCKS_ORCHESTRATION_NOT_EDITOR_CAPABILITY',
   'ENTITLEMENT_PASS!=RATE_CARD_ACTIVE',
   'ENTITLEMENT_PASS!=BUDGET_RESERVED',
   'ENTITLEMENT_PASS!=EFFECT_ADMISSION',
   'ENTITLEMENT_PASS!=PROVIDER_ATTEMPT',
   'ENTITLEMENT_PASS!=BILLING_COMMIT'
  ])
 });
}
