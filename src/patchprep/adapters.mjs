import {compilePatchPrepEconomy} from './economy.mjs';
import {compileFlatpackPatch} from '../flatpack/primitives.mjs';
import {compileAckItemTrinity} from '../acks/item-trinity.mjs';
import {compileRotflAckTemplateRoute} from '../acks/rotfl-template.mjs';
import {compileFourScaleScorecard} from '../scorecards/four-scale.mjs';

export const PATCH_PREP_ADAPTER_SCHEMA='xiio.sdk.patch-prep-adapter/v1';

function bundle(required,prepBySurface={}){
  const rows=[];
  const missing=[];
  for(const family of required){
    const input=prepBySurface[family];
    if(!input){missing.push(family);continue;}
    const compiled=compilePatchPrepEconomy({...input,surface_family:family});
    rows.push(compiled);
  }
  const unprepared=rows.filter(x=>x.prepared!==true).map(x=>x.surface_family);
  return Object.freeze({
    required:Object.freeze([...required]),
    rows:Object.freeze(rows),
    missing:Object.freeze(missing),
    unprepared:Object.freeze(unprepared),
    admitted:missing.length===0&&unprepared.length===0,
    effect_authority:false
  });
}
function wrap(kind,required,prepBySurface,compile){
  const prep=bundle(required,prepBySurface);
  if(!prep.admitted){
    return Object.freeze({
      schema:PATCH_PREP_ADAPTER_SCHEMA,
      kind,
      admitted:false,
      prep,
      result:null,
      authority_granted:false,
      provider_effect:false,
      hard:Object.freeze(['MISSING_OR_UNPREPARED_SURFACE=>NO_CARRIER_COMPILE','PREPARED!=EFFECT_AUTHORITY'])
    });
  }
  const result=compile();
  return Object.freeze({
    schema:PATCH_PREP_ADAPTER_SCHEMA,
    kind,
    admitted:true,
    prep,
    result,
    authority_granted:false,
    provider_effect:false,
    hard:Object.freeze(['PREPARED_ROUTE!=EFFECT_AUTHORITY','UNDERLYING_CARRIER_SEMANTICS_PRESERVED'])
  });
}

export function compilePreparedFlatpackPatch({prep_by_surface={},input={}}={}){
  return wrap('FLATPACK_PATCH',['FLATPACK','HOTPATCH','RETURN_REAP'],prep_by_surface,()=>compileFlatpackPatch(input));
}
export function compilePreparedRotflTemplateRoute({prep_by_surface={},input={}}={}){
  return wrap('ROTFL_TEMPLATE',['TEMPLATE'],prep_by_surface,()=>compileRotflAckTemplateRoute(input));
}
export function compilePreparedAckItemTrinity({prep_by_surface={},input={}}={}){
  return wrap(
    'ACK_ITEM_TRINITY',
    ['TRINITY','PUNCHCARD','SCORECARD','CHECKLIST','TEMPLATE','RETURN_REAP'],
    prep_by_surface,
    ()=>compileAckItemTrinity(input)
  );
}
export function compilePreparedFourScaleScorecard({prep_by_surface={},input={}}={}){
  return wrap('FOUR_SCALE_SCORECARD',['SCORECARD'],prep_by_surface,()=>compileFourScaleScorecard(input));
}
