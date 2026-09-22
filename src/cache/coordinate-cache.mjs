import crypto from 'node:crypto';

export const CACHE_SCHEMA='xiio.sdk.coordinate-cache/v1';
export const PATCH_SCHEMA='xiio.sdk.changed-only-patch-plan/v1';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const uuid=(v,k)=>{const x=text(v,k);if(!UUID.test(x))throw new TypeError(k+'_INVALID');return x;};
const arr=(v)=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))].sort():[];
const stable=(v)=>Array.isArray(v)?v.map(stable):(v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v);
const digest=(v)=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

function normalizeIdentity(i={}){
  return {
    root_uuid:uuid(i.root_uuid,'root_uuid'),
    work_uuid:uuid(i.work_uuid,'work_uuid'),
    occurrence_uuid:uuid(i.occurrence_uuid,'occurrence_uuid'),
    generation_ref:text(i.generation_ref,'generation_ref'),
  };
}
function normalizeDimension(d={}){
  return {
    axis:text(d.axis,'dimension.axis'),
    face:text(d.face,'dimension.face'),
    split:text(d.split,'dimension.split').toUpperCase(),
  };
}
export function coordinateAddress({identity,dimension,heuristic_ref='NONE',semantic_ref='NONE'}={}){
  const i=normalizeIdentity(identity);
  const d=normalizeDimension(dimension);
  const coordinate_ref=`D:${d.axis}:${d.face}:${d.split}`;
  const key_material={root_uuid:i.root_uuid,work_uuid:i.work_uuid,generation_ref:i.generation_ref,coordinate_ref,heuristic_ref,semantic_ref};
  return Object.freeze({
    identity:i,dimension:d,coordinate_ref,
    id_plus_d_address:`${i.root_uuid}/${i.work_uuid}@${coordinate_ref}`,
    cache_key:digest(key_material),
    authority_granted:false,
  });
}

export function createCoordinateCache({cache_ref='local://xiio/coordinate-cache'}={}){
  const rows=new Map();
  const metrics={reads:0,hits:0,misses:0,invalidations:0,writes:0};
  return Object.freeze({
    schema:CACHE_SCHEMA,
    cache_ref,
    get metrics(){return Object.freeze({...metrics});},
    read(address,{provider_generation_ref}={}){
      metrics.reads++;
      const row=rows.get(address.cache_key);
      if(!row){metrics.misses++;return Object.freeze({state:'MISS',provider_lookup_required:true,row:null});}
      if(provider_generation_ref && row.provider_generation_ref!==provider_generation_ref){
        metrics.invalidations++;
        return Object.freeze({state:'INVALIDATED_PROVIDER_GENERATION_MOVED',provider_lookup_required:true,row});
      }
      metrics.hits++;
      return Object.freeze({state:'HIT_CURRENT',provider_lookup_required:false,row});
    },
    write(address,{provider_generation_ref,payload,evidence_refs=[]}={}){
      const providerGen=text(provider_generation_ref,'provider_generation_ref');
      if(payload===undefined)throw new TypeError('payload_REQUIRED');
      const row=Object.freeze({
        cache_key:address.cache_key,
        id_plus_d_address:address.id_plus_d_address,
        coordinate_ref:address.coordinate_ref,
        root_uuid:address.identity.root_uuid,
        work_uuid:address.identity.work_uuid,
        occurrence_uuid:address.identity.occurrence_uuid,
        generation_ref:address.identity.generation_ref,
        provider_generation_ref:providerGen,
        payload,
        evidence_refs:arr(evidence_refs),
        payload_digest:digest(payload),
      });
      rows.set(address.cache_key,row);metrics.writes++;return row;
    },
    snapshot(){
      return Object.freeze({schema:CACHE_SCHEMA,cache_ref,rows:[...rows.values()].sort((a,b)=>a.cache_key.localeCompare(b.cache_key)),metrics:{...metrics},authority_granted:false,provider_effect:false});
    }
  });
}

export function compileChangedOnlyPatchPlan({baseline=[],current=[]}={}){
  if(!Array.isArray(baseline)||!Array.isArray(current))throw new TypeError('PATCH_ROWS_ARRAY_REQUIRED');
  const byKey=(rows)=>new Map(rows.map(r=>[text(r.cache_key,'cache_key'),r]));
  const before=byKey(baseline),after=byKey(current);
  const keys=[...new Set([...before.keys(),...after.keys()])].sort();
  const changed=[],unchanged=[],removed=[];
  for(const key of keys){
    const a=before.get(key),b=after.get(key);
    if(a&&!b){removed.push(key);continue;}
    if(!a&&b){changed.push({cache_key:key,reason:'NEW_COORDINATE',row:b});continue;}
    if(a.payload_digest!==b.payload_digest||a.provider_generation_ref!==b.provider_generation_ref){
      changed.push({cache_key:key,reason:a.provider_generation_ref!==b.provider_generation_ref?'PROVIDER_GENERATION_MOVED':'PAYLOAD_CHANGED',row:b});
    } else unchanged.push(key);
  }
  return Object.freeze({
    schema:PATCH_SCHEMA,
    denominator:keys.length,
    changed_count:changed.length,
    unchanged_count:unchanged.length,
    removed_count:removed.length,
    changed,unchanged,removed,
    patch_input_refs:changed.map(x=>x.cache_key),
    broad_rebuild_required:false,
    provider_effect:false,
    authority_granted:false,
    hard:['UNCHANGED_COORDINATE!=PATCH_INPUT','PROVIDER_GENERATION_MOVEMENT_INVALIDATES_COORDINATE','CHANGED_ONLY_PLAN!=MUTATION_AUTHORITY']
  });
}

export function compileTimeDollarCacheReceipt({baseline_provider_lookups,current_provider_lookups,baseline_patch_decisions,current_patch_decisions,owner_minutes_avoided=null,estimated_cost_avoided=null,evidence_refs=[]}={}){
  for(const [k,v] of Object.entries({baseline_provider_lookups,current_provider_lookups,baseline_patch_decisions,current_patch_decisions})){
    if(!Number.isInteger(v)||v<0)throw new TypeError(k+'_INVALID');
  }
  const provider_lookups_avoided=baseline_provider_lookups-current_provider_lookups;
  const patch_decision_slots_avoided=baseline_patch_decisions-current_patch_decisions;
  return Object.freeze({
    schema:'xiio.time-dollar-local-cache-receipt/v1',
    provider_lookups_avoided,
    patch_decision_slots_avoided,
    owner_minutes_avoided:Number.isFinite(owner_minutes_avoided)?owner_minutes_avoided:null,
    estimated_cost_avoided:Number.isFinite(estimated_cost_avoided)?estimated_cost_avoided:null,
    evidence_refs:arr(evidence_refs),
    money_state:Number.isFinite(estimated_cost_avoided)?'ESTIMATE_WITH_EVIDENCE_REQUIRED':'UNKNOWN_NO_RATE_CARD',
    authority_granted:false,
    hard:['TIME_SAVED!=MONEY_WITHOUT_RATE_CARD','NEGATIVE_SAVINGS_MUST_REMAIN_NEGATIVE','CACHE_HIT!=SOURCE_TRUTH']
  });
}
