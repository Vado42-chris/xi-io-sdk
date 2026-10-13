import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const MODES=new Set(['WORK','PRIVATE','HOME']);
const VIEWS=new Set(['BLACK_BOX','GLASS_BOX','BLACK_HOLE','API']);
export function compileObserver55({mode,view,fixture,observer,verdicts=[]}={}){
 if(!MODES.has(mode)||!VIEWS.has(view))throw Error('MODE_OR_VIEW_INVALID');
 if(!fixture||!validHash(fixture.fixture_sha256)||!validHash(fixture.predicate_sha256)||!Number.isSafeInteger(fixture.generation)||fixture.generation<0)throw Error('FIXTURE_INVALID');
 if(typeof observer!=='string'||!observer.trim())throw Error('OBSERVER_REQUIRED');
 if(!Array.isArray(verdicts)||new Set(verdicts.map(x=>x.coordinate)).size!==verdicts.length||!verdicts.every(x=>typeof x.coordinate==='string'&&typeof x.result==='string'&&validHash(x.evidence_sha256)))throw Error('VERDICTS_INVALID');
 const observation={schema:'xiio.sdk.observer55/v1',mode,view,fixture,observer,verdicts,authority:'NONE',provider_effect:false};
 return {...observation,observation_sha256:digest(observation)};
}
export function reconcileObserver55({fixture,observations,required=2}={}){
 if(!Array.isArray(observations)||observations.length<required||!Number.isInteger(required)||required<2)return {status:'WAIT_QUORUM',effect_authority:false};
 if(new Set(observations.map(x=>x.observer)).size!==observations.length)return {status:'RED',reason:'DUPLICATE_OBSERVER',effect_authority:false};
 const first=observations[0];
 if(!first||!MODES.has(first.mode)||!VIEWS.has(first.view))return {status:'RED',reason:'MODE_OR_VIEW_INVALID',effect_authority:false};
 for(const o of observations){
  if(o.schema!=='xiio.sdk.observer55/v1'||o.mode!==first.mode||o.view!==first.view||JSON.stringify(o.fixture)!==JSON.stringify(fixture)||o.observation_sha256!==digest({schema:o.schema,mode:o.mode,view:o.view,fixture:o.fixture,observer:o.observer,verdicts:o.verdicts,authority:'NONE',provider_effect:false}))return {status:'RED',reason:'FIXTURE_OR_RECEIPT_DRIFT',effect_authority:false};
 }
 const coords=[...new Set(observations.flatMap(o=>o.verdicts.map(v=>v.coordinate)))].sort();
 const disagreements=coords.filter(coordinate=>{const vals=observations.map(o=>o.verdicts.find(v=>v.coordinate===coordinate));return vals.some(v=>!v)||new Set(vals.map(v=>v.result+':'+v.evidence_sha256)).size>1;});
 return {schema:'xiio.sdk.observer55-reconciliation/v1',status:disagreements.length?'RED_DIVERGENCE':'MATCH_UNQUALIFIED',mode:first.mode,view:first.view,observer_count:observations.length,coordinates:coords.length,disagreements,effect_authority:false,provider_effect:false,level9:false};
}
