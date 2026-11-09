export const BLANK_TEST_BED_SCHEMA = 'xiio.sdk.blank-test-bed/v1';
export const BLANK_TEST_PROJECTION_SCHEMA = 'xiio.sdk.blank-test-projection/v1';
export const CUBE_SLOTS = Object.freeze(['PERSPECTIVE','ORTHO_XY','ORTHO_YZ','ORTHO_XZ']);

function text(value,label){
  if(typeof value!=='string'||!value.trim()) throw new TypeError(`${label} required`);
  return value.trim();
}
function freeze(value){
  if(Array.isArray(value)) return Object.freeze(value.map(freeze));
  if(value&&typeof value==='object'){
    const out={}; for(const [k,v] of Object.entries(value)) out[k]=freeze(v); return Object.freeze(out);
  }
  return value;
}
const PRIVATE_KEYS=new Set(['private_payload','raw_user_data','secret','credential','inline_private_data','password','api_key','access_token','refresh_token','__proto__','constructor','prototype']);
function rejectPrivate(input,label){
  const visited=new WeakSet();
  function walk(value,depth){
    if(value===null||typeof value!=='object')return;
    if(depth>24||visited.has(value))throw new TypeError(label+' invalid nested payload');
    visited.add(value);
    for(const [key,child] of Object.entries(value)){
      if(PRIVATE_KEYS.has(key.toLowerCase()))throw new TypeError(label+' cannot contain '+key);
      walk(child,depth+1);
    }
  }
  walk(input,0);
}

export function compileBlankTestBed(input={}){
  rejectPrivate(input,'Blank Test Bed');
  return freeze({
    schema:BLANK_TEST_BED_SCHEMA,
    artifact_type:'BLANK_TEST_BED',
    artifact_id:text(input.artifact_id,'artifact_id'),
    generation:text(input.generation,'generation'),
    created_from:text(input.created_from||'EMPTY','created_from'),
    source_generation:text(input.source_generation||'NONE','source_generation'),
    state:{
      records:[],
      events:[],
      heuristic_events:[],
      resources:[],
      relationships:[],
    },
    ready:true,
    authority:{
      provider_effect:false,
      live_runtime:false,
      heuristic_weight_promotion:false,
    },
    hard:[
      'BLANK_TEST_BED!=EMPTY_SCREEN',
      'BLANK_TEST_BED!=USER_DATA',
      'BLANK_TEST_BED!=LIVE_RUNTIME',
      'SERIALIZED_BLANK!=MISSING_ARTIFACT',
    ],
  });
}

export function compileBlankTestProjection(input={}){
  rejectPrivate(input,'Blank Test Projection');
  const slots=Array.isArray(input.slots)?input.slots.map((raw,index)=>{
    const id=text(raw?.id,`slots[${index}].id`).toUpperCase();
    if(!CUBE_SLOTS.includes(id)) throw new TypeError(`unsupported slot: ${id}`);
    return {
      id,
      role:text(raw.role,`slots[${index}].role`),
      camera:freeze(raw.camera||{}),
      filters:freeze(raw.filters||{}),
    };
  }):[];
  if(slots.length!==4) throw new TypeError('exact four-slot denominator required');
  if(new Set(slots.map(s=>s.id)).size!==4) throw new TypeError('duplicate projection slot');
  for(const id of CUBE_SLOTS) if(!slots.some(s=>s.id===id)) throw new TypeError(`missing projection slot: ${id}`);

  return freeze({
    schema:BLANK_TEST_PROJECTION_SCHEMA,
    artifact_type:'BLANK_TEST_PROJECTION',
    artifact_id:text(input.artifact_id,'artifact_id'),
    generation:text(input.generation,'generation'),
    test_bed_ref:text(input.test_bed_ref,'test_bed_ref'),
    test_bed_generation:text(input.test_bed_generation,'test_bed_generation'),
    recipe_ref:text(input.recipe_ref,'recipe_ref'),
    recipe_generation:text(input.recipe_generation,'recipe_generation'),
    slots,
    selected_ids:[],
    ready:true,
    authority:{source_state:false,effect_authority:false},
    hard:[
      'BLANK_TEST_PROJECTION!=SCREENSHOT',
      'PROJECTION!=SOURCE_STATE',
      'VIEW_CHANGE!=TEST_BED_MUTATION',
      'FOUR_SLOT_DENOMINATOR_REQUIRED',
    ],
  });
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
function canonicalArtifact(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('compiled artifact required');
  rejectPrivate(value,'Test Artifact');
  let expected;
  if(value.schema===BLANK_TEST_BED_SCHEMA){
    expected=compileBlankTestBed({artifact_id:value.artifact_id,generation:value.generation,created_from:value.created_from,source_generation:value.source_generation});
  }else if(value.schema===BLANK_TEST_PROJECTION_SCHEMA){
    expected=compileBlankTestProjection({artifact_id:value.artifact_id,generation:value.generation,test_bed_ref:value.test_bed_ref,test_bed_generation:value.test_bed_generation,recipe_ref:value.recipe_ref,recipe_generation:value.recipe_generation,slots:value.slots});
  }else throw new TypeError('unsupported test artifact schema');
  if(JSON.stringify(stable(value))!==JSON.stringify(stable(expected)))throw new TypeError('NONCANONICAL_TEST_ARTIFACT');
  return expected;
}
export function serializeTestArtifact(artifact){
  return JSON.stringify(canonicalArtifact(artifact),null,2);
}
export function parseTestArtifact(serialized){
  return canonicalArtifact(JSON.parse(text(serialized,'serialized')));
}
