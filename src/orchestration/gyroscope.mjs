export const GYROSCOPE_SCHEMA='xiio.sdk.projection-gyroscope/v1';
export const GYROSCOPE_GEARS=Object.freeze([1,3,9,27]);
export const GYROSCOPE_AXES=Object.freeze([
  'TIME','SCALE','DIRECTION','POLARITY','READER','WARD',
  'LEGAL','CUSTODY','STATE','PACKAGE','COG','SIM'
]);

export const GYROSCOPE_HARD=Object.freeze([
  'GYROSCOPE != EFFECT_AUTHORITY',
  'GEAR != AUTHORITY',
  'SPEED != TRUTH',
  'ONE_BLOCKED_VOICE != GLOBAL_STOP',
  'PROJECTION_ROTATION != SPINE_MUTATION',
  'SPINE_MUST_REMAIN_STRAIGHT',
  'UNSELECTED_READY_WORK != REAPED_WORK',
  'BLOCKED_WORK_REMAINS_IN_DENOMINATOR',
  'GEAR_CHANGE != ABI_CHANGE',
  'CADENCE_CHANGE != CURRENTNESS_CHANGE',
]);

const text=(v)=>String(v??'').trim();

function cleanList(values=[]){
  return [...new Set(values.map(text).filter(Boolean))];
}

function stableSpine(spine={}){
  const required=['root_ref','generation_ref','denominator_ref','return_target_ref','effect_ceiling','privacy_ceiling'];
  const missing=required.filter(k=>!text(spine[k]));
  if(missing.length) return {ok:false,code:'GYROSCOPE_SPINE_FIELDS_REQUIRED',missing,hard:GYROSCOPE_HARD};
  return {
    ok:true,
    spine:Object.freeze({
      root_ref:text(spine.root_ref),
      generation_ref:text(spine.generation_ref),
      denominator_ref:text(spine.denominator_ref),
      return_target_ref:text(spine.return_target_ref),
      effect_ceiling:text(spine.effect_ceiling),
      privacy_ceiling:text(spine.privacy_ceiling),
      source_refs:Object.freeze(cleanList(spine.source_refs)),
    })
  };
}

export function normalizeGyroscopeGear(value=1){
  const gear=Number(value);
  if(!GYROSCOPE_GEARS.includes(gear)) throw new TypeError('GYROSCOPE_GEAR_MUST_BE_1_3_9_27');
  return gear;
}

export function compileProjectionGyroscope({
  spine={},
  gear=1,
  axis='DIRECTION',
  direction='FORWARD',
  work_items=[],
}={}){
  const s=stableSpine(spine);
  if(!s.ok) return s;
  const normalizedGear=normalizeGyroscopeGear(gear);
  const normalizedAxis=text(axis).toUpperCase();
  if(!GYROSCOPE_AXES.includes(normalizedAxis)) return {ok:false,code:'GYROSCOPE_AXIS_INVALID',hard:GYROSCOPE_HARD};
  const normalizedDirection=text(direction).toUpperCase();
  if(!['FORWARD','REVERSE'].includes(normalizedDirection)) return {ok:false,code:'GYROSCOPE_DIRECTION_INVALID',hard:GYROSCOPE_HARD};
  if(!Array.isArray(work_items)) return {ok:false,code:'GYROSCOPE_WORK_ITEMS_ARRAY_REQUIRED',hard:GYROSCOPE_HARD};

  const normalized=work_items.map((item,index)=>({
    work_ref:text(item?.work_ref)||`work:${index+1}`,
    state:text(item?.state||'UNKNOWN').toUpperCase(),
    priority:Number.isFinite(item?.priority)?Number(item.priority):0,
    projection_ref:text(item?.projection_ref)||null,
    blocked_by:cleanList(item?.blocked_by),
    first_red:text(item?.first_red)||null,
  }));

  const ready=normalized
    .filter(x=>['READY','OPEN','TRUE_WAIT','WAIT','AVAILABLE_NOT_RUN','SOURCE_ONLY','SUBFUNCTION','SOURCE_BOUND'].includes(x.state))
    .filter(x=>x.blocked_by.length===0)
    .sort((a,b)=>b.priority-a.priority || a.work_ref.localeCompare(b.work_ref));
  const blocked=normalized.filter(x=>x.blocked_by.length>0 || x.state==='BLOCKED' || x.state==='FAIL');
  const terminal=normalized.filter(x=>['PASS','DONE','TERMINAL','REAPED'].includes(x.state));
  const selected=ready.slice(0,normalizedGear);
  const queued=ready.slice(normalizedGear);

  return Object.freeze({
    ok:true,
    gyroscope:Object.freeze({
      schema:GYROSCOPE_SCHEMA,
      state:selected.length?'ORIENTED':'TRUE_WAIT',
      spine:s.spine,
      gimbal:Object.freeze({
        axis:normalizedAxis,
        direction:normalizedDirection,
        projection_plane:`${normalizedAxis}:${normalizedDirection}`,
      }),
      rotor:Object.freeze({
        gear:normalizedGear,
        packet_density:normalizedGear,
        selected_count:selected.length,
        queued_count:queued.length,
        blocked_count:blocked.length,
        terminal_count:terminal.length,
      }),
      denominator:normalized.length,
      selected:Object.freeze(selected),
      queued:Object.freeze(queued),
      blocked:Object.freeze(blocked),
      terminal:Object.freeze(terminal),
      authority_granted:false,
      provider_effect:false,
      hard:GYROSCOPE_HARD,
    })
  });
}
