import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { compileProjectionGyroscope, normalizeGyroscopeGear } from '../orchestration/gyroscope.mjs';

export const OPUS_SCHEMA='xiio.opus-ignition/v1';

export const HARD=Object.freeze([
  'OPUS != SECOND_FRAMEWORK',
  'OPUS != EFFECT_AUTHORITY',
  'IGNITION != PROVIDER_ATTEMPT',
  'SOURCE_PRESENT != RUNTIME_QUALIFIED',
  'MNEMONIC != SEMANTIC_OWNER',
  'PHONETIC_ALIAS != NEW_ENGINE',
  'LINGUISTIC_PROJECTION != NEW_ENGINE',
  'MATHS_SOURCE != MATHS_RUNTIME',
  'PNEUMA_SOURCE_PASS != NATIVE_LOOP_CLOSED',
  'HEURISTIC_EVENT != LIVE_WEIGHT',
  'METRIC != MONEY_WITHOUT_RATE_CARD',
  'OBSERVER != MUTATION_AUTHORITY',
  'OWNER_RETYPE=0',
]);

const FRAMEWORK_LANES=Object.freeze([
  {
    id:'INGRESS',
    family:'CORE_ENGINE',
    owner:'Ingress',
    refs:['engines/ingress/ingress-config.yaml'],
  },
  {
    id:'BINNING_42',
    family:'CORE_ENGINE',
    owner:'Binning',
    refs:['engines/binning/bin-map-42.yaml'],
  },
  {
    id:'ANALYSIS',
    family:'CORE_ENGINE',
    owner:'Analysis',
    refs:['engines/analysis/analysis-rules.yaml'],
  },
  {
    id:'MATHS',
    family:'CORE_ENGINE',
    owner:'Maths',
    refs:[
      'docs/standards/MATHS-ENGINE-001_constraint-coherence-update.md',
      'docs/framework/maths-engine-placement-audit-v1.md',
    ],
    qualification:'SOURCE_ONLY',
  },
  {
    id:'ROSETTA',
    family:'CORE_ENGINE',
    owner:'Rosetta Stone',
    refs:[
      'engines/lexicon/semantic-projection.mjs',
      'standards/lexicon/rosetta-spellcheck.v1.json',
    ],
    validator:'scripts/validate-rosetta-lexicon-glassbox-runtime.mjs',
    read_only_validator:true,
  },
  {
    id:'EGRESS',
    family:'CORE_ENGINE',
    owner:'Egress',
    refs:['engines/egress/egress-config.yaml'],
  },
  {
    id:'OBSERVER_IBAL',
    family:'CONDUCTOR',
    owner:'Observer / Ibal',
    refs:['docs/framework/ibal-observer-conductor-doctrine-v1.md'],
  },
  {
    id:'HEURISTICS',
    family:'LEARNING_CONTROL',
    owner:'Heuristics / Cadence / Ibal',
    refs:['engines/heuristics/heuristics-stream.preview.json'],
    validator:'scripts/validate-heuristics-stream.mjs',
    read_only_validator:true,
  },
  {
    id:'ANTS',
    family:'BINARY_SIGNAL',
    owner:'Automated Neural Token',
    refs:['standards/punchcards/automated-neural-token.v1.json'],
    validator:'scripts/validate-automated-neural-token.mjs',
    read_only_validator:true,
  },
  {
    id:'ROTFL',
    family:'LOOP_CONTROL',
    owner:'ROTFL global heartbeat',
    refs:['standards/punchcards/rotfl-global-heartbeat.v1.json'],
    validator:'scripts/validate-onboarding-global-rotfl-truth.mjs',
    read_only_validator:true,
  },
  {
    id:'TRINITY',
    family:'FORMATION',
    owner:'Trinity fireteam',
    refs:['engines/session-dispatch/trinity-fireteam-runtime.mjs'],
    validator:'scripts/validate-trinity-fireteam.mjs',
    read_only_validator:true,
  },
  {
    id:'QUERY_EVENT',
    family:'SEARCH_CRM',
    owner:'QueryEvent / CRM return',
    refs:['standards/query/query-event.v1.json'],
    validator:'scripts/validate-query-event-standard.mjs',
    read_only_validator:true,
  },
  {
    id:'POLYRHYTHM_METER',
    family:'METRICS',
    owner:'Polyrhythm orchestration meter',
    refs:['standards/metering/polyrhythm-orchestration-meter.v1.json'],
    validator:'scripts/validate-gamify-pass-meter.mjs',
    read_only_validator:true,
  },
  {
    id:'TIME_1S',
    family:'METRICS',
    owner:'one-second time meter',
    refs:['scripts/compile-time-meter-1s.mjs'],
    validator:'scripts/validate-time-meter-1s.mjs',
    read_only_validator:true,
  },
  {
    id:'COG_METER',
    family:'METRICS',
    owner:'owner cognitive-load / cog event meter',
    refs:['scripts/compile-cog-event-meter.mjs'],
    validator:'scripts/validate-cog-event-meter.mjs',
    read_only_validator:true,
  },
  {
    id:'RUNTIME_BINARY_ECONOMY',
    family:'METRICS',
    owner:'runtime binary economy',
    refs:['scripts/compile-runtime-binary-economy.mjs'],
    validator:'scripts/validate-runtime-binary-economy.mjs',
    read_only_validator:true,
  },
  {
    id:'ATOMIC_1S',
    family:'ROTFL_METRICS',
    owner:'atomic gate cube',
    refs:['standards/onboarding/rotfl-atomic-gate-cube-1s.v1.json'],
    validator:'scripts/validate-rotfl-atomic-gate-cube-1s.mjs',
    read_only_validator:true,
  },
  {
    id:'SPINE_SPIN',
    family:'GEOMETRY',
    owner:'ROTFL spine/spin census',
    refs:['standards/punchcards/rotfl-spine-spin-geometry.v1.json'],
    validator:'scripts/validate-spine-spin-census.mjs',
    read_only_validator:true,
  },
  {
    id:'MNEMONICS',
    family:'LANGUAGE',
    owner:'Rosetta + semantic owners',
    refs:[
      'docs/framework/serialized-comment-and-rosetta-tag-standard-v1.md',
      'docs/framework/lexicon-naming-standard-v1.md',
    ],
    qualification:'ROSETTA_SUBFUNCTION',
  },
  {
    id:'PHONETICS',
    family:'LANGUAGE',
    owner:'Rosetta + Ibal naming doctrine',
    refs:['docs/framework/ibal-observer-conductor-doctrine-v1.md'],
    qualification:'ROSETTA_SUBFUNCTION',
  },
  {
    id:'LINGUISTICS',
    family:'LANGUAGE',
    owner:'Rosetta semantic projection',
    refs:[
      'docs/framework/rosetta-lexicon-namespace-and-scope-standard-v1.md',
      'engines/lexicon/semantic-projection.mjs',
    ],
    qualification:'ROSETTA_SUBFUNCTION',
  },
]);

const SDK_LANES=Object.freeze([
  {
    id:'QUAL_QUANT',
    family:'METRICS',
    owner:'SDK qual/quant topography',
    refs:['src/data/qual-quant-topography.mjs'],
    validator:'scripts/validate-qual-quant-topography.mjs',
    read_only_validator:true,
  },
  {
    id:'PNEUMA_FRONTDOOR',
    family:'LOOP_CONTROL',
    owner:'SDK PNEUMA front door',
    refs:['src/runtime/pneuma-frontdoor.mjs'],
    qualification:'PULSE_BOUND_AT_RUNTIME',
  },
  {
    id:'MINI_PROMPT_STACK',
    family:'COMMS',
    owner:'Cadence mini-prompt stack',
    refs:['src/cadence/mini-prompt-stack.mjs'],
    validator:'scripts/validate-mini-prompt-stack.mjs',
    read_only_validator:true,
  },
  {
    id:'TRANSITION_PROOF',
    family:'MATHS_GEOMETRY',
    owner:'transition proof reducer',
    refs:['src/evaluation/transition-proof-reducer.mjs'],
    validator:'scripts/validate-transition-proof-reducer-100s.mjs',
    read_only_validator:true,
  },
]);

const text=(v)=>String(v??'').trim();
const sha=(v)=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function fileState(root, refs){
  if(!root) return {state:'TRUE_WAIT',missing:[...refs],present:[]};
  const present=[];
  const missing=[];
  for(const ref of refs){
    const full=path.join(root,ref);
    if(fs.existsSync(full)) present.push(ref); else missing.push(ref);
  }
  return {state:missing.length?'TRUE_WAIT':'PASS',present,missing};
}

function validatorState(root, lane, {verify=false,node=process.execPath,timeout_ms=8000}={}){
  if(!lane.validator) return {
    state:lane.qualification==='SOURCE_ONLY'?'SOURCE_ONLY':
      lane.qualification==='ROSETTA_SUBFUNCTION'?'SUBFUNCTION':
      lane.qualification==='PULSE_BOUND_AT_RUNTIME'?'RUNTIME_BOUND':
      'SOURCE_BOUND',
    validator:null,
    exit_code:null,
  };
  const validator=path.join(root||'',lane.validator);
  if(!root || !fs.existsSync(validator)) return {state:'TRUE_WAIT',validator:lane.validator,exit_code:null,first_red:'VALIDATOR_MISSING'};
  if(!verify) return {state:'AVAILABLE_NOT_RUN',validator:lane.validator,exit_code:null};
  if(lane.read_only_validator!==true) return {state:'SKIPPED_MUTATION_RISK',validator:lane.validator,exit_code:null};
  const run=spawnSync(node,[validator],{
    cwd:root,
    encoding:'utf8',
    timeout:timeout_ms,
    env:{...process.env,XIIO_OPUS_READ_ONLY:'1'},
    maxBuffer:1024*1024,
  });
  const stdout=text(run.stdout);
  const stderr=text(run.stderr);
  return {
    state:run.status===0?'PASS':'FAIL',
    validator:lane.validator,
    exit_code:run.status,
    signal:run.signal||null,
    first_red:run.status===0?null:(stderr||stdout||run.error?.message||'VALIDATOR_FAILED').split(/\r?\n/)[0].slice(0,320),
    output_digest:sha({stdout,stderr}).slice(0,24),
  };
}

function compileLane(root,lane,options){
  const files=fileState(root,lane.refs);
  if(files.state!=='PASS'){
    return {...lane,state:'TRUE_WAIT',source_state:'MISSING',present_refs:files.present,missing_refs:files.missing,validator_state:null,first_red:'SOURCE_REF_MISSING'};
  }
  const validation=validatorState(root,lane,options);
  const failed=validation.state==='FAIL'||validation.state==='TRUE_WAIT';
  return {
    id:lane.id,
    family:lane.family,
    owner:lane.owner,
    state:failed?'TRUE_WAIT':validation.state,
    source_state:'PASS',
    present_refs:files.present,
    missing_refs:[],
    validator_state:validation,
    first_red:failed?(validation.first_red||'VALIDATOR_NOT_CURRENT'):null,
  };
}

export function compileOpusIgnition({
  framework_root=null,
  sdk_root=null,
  framework_generation_state='UNKNOWN',
  verify=false,
  pneuma_pulse=null,
  gear=1,
  axis='DIRECTION',
  direction='FORWARD',
  node=process.execPath,
}={}){
  const selectedGear=normalizeGyroscopeGear(gear);
  const framework=FRAMEWORK_LANES.map(lane=>compileLane(framework_root,lane,{verify,node}));
  const sdk=SDK_LANES.map(lane=>compileLane(sdk_root,lane,{verify,node}));

  const pneuma=sdk.find(x=>x.id==='PNEUMA_FRONTDOOR');
  if(pneuma && pneuma.source_state==='PASS'){
    pneuma.state=pneuma_pulse?.state||'TRUE_WAIT';
    pneuma.first_red=pneuma_pulse?.first_red|| (pneuma_pulse?'PNEUMA_NOT_PASS':'PNEUMA_PULSE_NOT_BOUND');
    pneuma.pulse={
      state:pneuma_pulse?.state||null,
      first_red:pneuma_pulse?.first_red||null,
      proof_scope:pneuma_pulse?.proof_scope||null,
      source_checks_pass:pneuma_pulse?.source_checks_pass??null,
      rotfl_loop_closed:pneuma_pulse?.claims?.rotfl_loop_closed??null,
    };
    if(pneuma.state==='PASS') pneuma.first_red=null;
  }

  const all=[...framework,...sdk];
  const hardFail=all.filter(x=>x.validator_state?.state==='FAIL');
  const waits=all.filter(x=>['TRUE_WAIT','AVAILABLE_NOT_RUN','SOURCE_ONLY','RUNTIME_BOUND'].includes(x.state));
  const pass=all.filter(x=>['PASS','SUBFUNCTION','SOURCE_BOUND'].includes(x.state));
  const firstRed=hardFail[0]?.first_red || waits[0]?.first_red || (framework_generation_state!=='EXACT_PROVIDER_MAIN'?'FRAMEWORK_CURRENTNESS_NOT_EXACT_PROVIDER_MAIN':null);

  const gyroscopeWork=all.map((lane,index)=>{
    const terminal=['PASS','SUBFUNCTION','SOURCE_BOUND'].includes(lane.state);
    const blocked=lane.source_state==='MISSING'
      || (lane.id==='PNEUMA_FRONTDOOR' && lane.state==='TRUE_WAIT' && lane.first_red);
    return {
      work_ref:`opus:${lane.id}`,
      projection_ref:`projection:opus:${lane.id}`,
      state:terminal?'PASS':blocked?'BLOCKED':'READY',
      priority:lane.validator_state?.state==='FAIL'?100:
        lane.state==='AVAILABLE_NOT_RUN'?80:
        lane.state==='SOURCE_ONLY'?60:
        lane.state==='TRUE_WAIT'?50:
        10-index,
      blocked_by:blocked?[lane.first_red||'SOURCE_OR_RUNTIME_WAIT']:[],
      first_red:lane.first_red||null,
    };
  });
  const gyro=compileProjectionGyroscope({
    spine:{
      root_ref:'root:xi-io-opus',
      generation_ref:framework_generation_state,
      denominator_ref:`denominator:opus:${all.length}`,
      return_target_ref:'return:xi-io-opus',
      effect_ceiling:'NO_EFFECT',
      privacy_ceiling:'PRIVATE_INHERITED',
      source_refs:['xi-io.net','xi-io-sdk'],
    },
    gear:selectedGear,
    axis,
    direction,
    work_items:gyroscopeWork,
  });
  if(!gyro.ok) throw new Error(gyro.code||'GYROSCOPE_COMPILE_FAILED');

  return Object.freeze({
    schema:OPUS_SCHEMA,
    ignition_key:'xi-io-opus',
    state:hardFail.length?'FAIL':firstRed?'IGNITED_WITH_WAITS':'PASS',
    verify:Boolean(verify),
    framework_generation_state,
    transmission:{
      gear:selectedGear,
      axis:String(axis).toUpperCase(),
      direction:String(direction).toUpperCase(),
      gyroscope:gyro.gyroscope,
    },
    denominator:all.length,
    pass:pass.length,
    wait:waits.length,
    fail:hardFail.length,
    lanes:all,
    ownership:{
      core_engine_chain:['INGRESS','ANALYSIS','MATHS','ROSETTA','EGRESS','OBSERVER_IBAL'],
      binning:'BINNING_42',
      language:{
        mnemonics:'ROSETTA + semantic owners',
        phonetics:'ROSETTA_SUBFUNCTION',
        linguistics:'ROSETTA_SUBFUNCTION',
      },
      metrics:['MATHS','QUAL_QUANT','POLYRHYTHM_METER','TIME_1S','COG_METER','RUNTIME_BINARY_ECONOMY','ATOMIC_1S'],
      loop_control:['ANTS','ROTFL','TRINITY','PNEUMA_FRONTDOOR','SPINE_SPIN'],
      comms:['QUERY_EVENT','MINI_PROMPT_STACK'],
    },
    first_red:firstRed,
    provider_effect:false,
    authority_granted:false,
    next:firstRed?'OPEN_LOCAL_OPERATOR_WITH_TYPED_WAITS_AND_BURN_FIRST_RED':'OPEN_LOCAL_OPERATOR',
    hard:HARD,
  });
}
