export const PROGRESSIVE_DISCOVERY_SCHEMA='xiio.sdk.progressive-discovery/v1';
export const DISCOVERY_LEVELS=Object.freeze(['GLANCE','WORK','PROOF','FULL']);
const RANK=Object.freeze({GLANCE:0,WORK:1,PROOF:2,FULL:3});

function text(v,k){
  if(typeof v!=='string'||!v.trim()) throw new TypeError(k+'_REQUIRED');
  return v.trim();
}
function level(v,k){
  const x=text(v,k).toUpperCase();
  if(!Object.hasOwn(RANK,x)) throw new TypeError(k+'_INVALID');
  return x;
}
function clone(v){ return v===undefined?undefined:structuredClone(v); }

export function compileProgressiveDiscovery(input={}){
  const source_ref=text(input.source_ref,'source_ref');
  const source_generation=text(input.source_generation,'source_generation');
  const requested_level=level(input.requested_level||'GLANCE','requested_level');
  const allowed_level=level(input.allowed_level||requested_level,'allowed_level');
  const effective_level=RANK[requested_level] <= RANK[allowed_level] ? requested_level : allowed_level;

  if(!Array.isArray(input.fields)||input.fields.length===0) throw new TypeError('fields_REQUIRED');
  const seen=new Set();
  const visible=[], hidden=[];
  for(let i=0;i<input.fields.length;i++){
    const raw=input.fields[i];
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new TypeError('field_INVALID');
    const key=text(raw.key,'field_key');
    if(seen.has(key)) throw new TypeError('field_DUPLICATE:'+key);
    seen.add(key);
    const min_level=level(raw.min_level||'GLANCE','field_min_level');
    const state=text(raw.state||'KNOWN','field_state').toUpperCase();
    const evidence_refs=Array.isArray(raw.evidence_refs)
      ? [...new Set(raw.evidence_refs.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))]
      : [];
    const row={
      key,
      min_level,
      state,
      value:clone(raw.value),
      evidence_refs,
      source_ref:raw.source_ref?text(raw.source_ref,'field_source_ref'):source_ref,
      source_generation:raw.source_generation?text(raw.source_generation,'field_source_generation'):source_generation,
    };
    if(RANK[min_level] <= RANK[effective_level]) visible.push(row);
    else hidden.push({key,min_level,state,source_ref:row.source_ref,source_generation:row.source_generation});
  }

  const identity_keys=Array.isArray(input.identity_keys)
    ? [...new Set(input.identity_keys.map((x,i)=>text(x,'identity_key_'+i)))]
    : [];
  const missing_identity=identity_keys.filter(k=>!seen.has(k));
  if(missing_identity.length) throw new TypeError('IDENTITY_FIELD_MISSING:'+missing_identity.join(','));

  const visibleKeys=new Set(visible.map(x=>x.key));
  const hidden_identity=identity_keys.filter(k=>!visibleKeys.has(k));
  const blockers=[];
  if(hidden_identity.length) blockers.push('IDENTITY_HIDDEN:'+hidden_identity.join(','));

  const required_currentness_key=input.currentness_key?text(input.currentness_key,'currentness_key'):null;
  if(required_currentness_key && !visibleKeys.has(required_currentness_key)) blockers.push('CURRENTNESS_HIDDEN:'+required_currentness_key);

  return Object.freeze({
    schema:PROGRESSIVE_DISCOVERY_SCHEMA,
    projection_ref:text(input.projection_ref,'projection_ref'),
    source_ref,
    source_generation,
    requested_level,
    allowed_level,
    effective_level,
    visible_fields:Object.freeze(visible.map(x=>Object.freeze(x))),
    hidden_fields:Object.freeze(hidden.map(x=>Object.freeze(x))),
    visible_count:visible.length,
    hidden_count:hidden.length,
    drilldown_available:hidden.length>0 && RANK[effective_level] < RANK[allowed_level],
    next_level:hidden.length>0 && RANK[effective_level] < RANK[allowed_level]
      ? DISCOVERY_LEVELS[RANK[effective_level]+1]
      : null,
    blockers:Object.freeze(blockers),
    ready:blockers.length===0,
    authority_granted:false,
    effect_authority:false,
    source_mutated:false,
    hard:Object.freeze([
      'FULL_SOURCE!=FULL_SURFACE',
      'LESS_VISIBLE!=LESS_STORED',
      'HIDDEN_FIELD!=DELETED_FIELD',
      'PROGRESSIVE_DISCOVERY!=TRUNCATION',
      'DRILLDOWN!=SECOND_TRUTH_STORE',
      'PROJECTION_LEVEL!=AUTHORITY',
      'REQUESTED_LEVEL>CURRENT_ACCESS=>CLAMP',
      'IDENTITY_MUST_SURVIVE_EVERY_LEVEL',
      'CURRENTNESS_MUST_SURVIVE_WHEN_REQUIRED',
    ]),
  });
}
