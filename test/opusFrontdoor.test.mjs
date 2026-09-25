import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileOpusIgnition } from '../src/runtime/opus-frontdoor.mjs';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-opus-framework-'));
  const sdk=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-opus-sdk-'));
  const refs=[
    'engines/ingress/ingress-config.yaml',
    'engines/binning/bin-map-42.yaml',
    'engines/analysis/analysis-rules.yaml',
    'docs/standards/MATHS-ENGINE-001_constraint-coherence-update.md',
    'docs/framework/maths-engine-placement-audit-v1.md',
    'engines/lexicon/semantic-projection.mjs',
    'standards/lexicon/rosetta-spellcheck.v1.json',
    'engines/egress/egress-config.yaml',
    'docs/framework/ibal-observer-conductor-doctrine-v1.md',
    'engines/heuristics/heuristics-stream.preview.json',
    'standards/punchcards/automated-neural-token.v1.json',
    'standards/punchcards/rotfl-global-heartbeat.v1.json',
    'engines/session-dispatch/trinity-fireteam-runtime.mjs',
    'standards/query/query-event.v1.json',
    'standards/metering/polyrhythm-orchestration-meter.v1.json',
    'scripts/compile-time-meter-1s.mjs',
    'scripts/compile-cog-event-meter.mjs',
    'scripts/compile-runtime-binary-economy.mjs',
    'standards/onboarding/rotfl-atomic-gate-cube-1s.v1.json',
    'standards/punchcards/rotfl-spine-spin-geometry.v1.json',
    'docs/framework/serialized-comment-and-rosetta-tag-standard-v1.md',
    'docs/framework/lexicon-naming-standard-v1.md',
    'docs/framework/rosetta-lexicon-namespace-and-scope-standard-v1.md',
  ];
  for(const ref of refs){
    const p=path.join(root,ref); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,'fixture\n');
  }
  for(const ref of [
    'src/data/qual-quant-topography.mjs',
    'src/runtime/pneuma-frontdoor.mjs',
    'src/cadence/mini-prompt-stack.mjs',
    'src/evaluation/transition-proof-reducer.mjs',
  ]){
    const p=path.join(sdk,ref); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,'fixture\n');
  }
  return {root,sdk};
}

test('opus maps phonetics and linguistics to Rosetta rather than inventing engines',()=>{
  const {root,sdk}=fixture();
  const out=compileOpusIgnition({
    framework_root:root,
    sdk_root:sdk,
    framework_generation_state:'EXACT_PROVIDER_MAIN',
    verify:false,
    pneuma_pulse:{state:'TRUE_WAIT',first_red:'ARIES_TRANSPORT_OFFLINE',proof_scope:'HOME_CURRENT',source_checks_pass:false,claims:{rotfl_loop_closed:false}},
  });
  assert.equal(out.ownership.language.phonetics,'ROSETTA_SUBFUNCTION');
  assert.equal(out.ownership.language.linguistics,'ROSETTA_SUBFUNCTION');
  assert.equal(out.hard.includes('PHONETIC_ALIAS != NEW_ENGINE'),true);
  assert.equal(out.hard.includes('LINGUISTIC_PROJECTION != NEW_ENGINE'),true);
});

test('opus preserves maths source versus runtime distinction',()=>{
  const {root,sdk}=fixture();
  const out=compileOpusIgnition({
    framework_root:root,
    sdk_root:sdk,
    framework_generation_state:'EXACT_PROVIDER_MAIN',
    verify:false,
    pneuma_pulse:{state:'TRUE_WAIT',first_red:'ARIES_TRANSPORT_OFFLINE',claims:{rotfl_loop_closed:false}},
  });
  const maths=out.lanes.find(x=>x.id==='MATHS');
  assert.equal(maths.state,'SOURCE_ONLY');
  assert.equal(out.hard.includes('MATHS_SOURCE != MATHS_RUNTIME'),true);
});

test('opus does not turn a PNEUMA source into native closure',()=>{
  const {root,sdk}=fixture();
  const out=compileOpusIgnition({
    framework_root:root,
    sdk_root:sdk,
    framework_generation_state:'EXACT_PROVIDER_MAIN',
    verify:false,
    pneuma_pulse:{state:'TRUE_WAIT',first_red:'ARIES_TRANSPORT_OFFLINE',proof_scope:'HOME_CURRENT',source_checks_pass:true,claims:{rotfl_loop_closed:false}},
  });
  const p=out.lanes.find(x=>x.id==='PNEUMA_FRONTDOOR');
  assert.equal(p.state,'TRUE_WAIT');
  assert.equal(p.first_red,'ARIES_TRANSPORT_OFFLINE');
  assert.equal(p.pulse.rotfl_loop_closed,false);
});

test('missing source stays typed wait',()=>{
  const {root,sdk}=fixture();
  fs.unlinkSync(path.join(root,'engines/ingress/ingress-config.yaml'));
  const out=compileOpusIgnition({
    framework_root:root,
    sdk_root:sdk,
    framework_generation_state:'EXACT_PROVIDER_MAIN',
    verify:false,
    pneuma_pulse:{state:'PASS',first_red:null,claims:{rotfl_loop_closed:true}},
  });
  const ingress=out.lanes.find(x=>x.id==='INGRESS');
  assert.equal(ingress.state,'TRUE_WAIT');
  assert.equal(ingress.first_red,'SOURCE_REF_MISSING');
});
