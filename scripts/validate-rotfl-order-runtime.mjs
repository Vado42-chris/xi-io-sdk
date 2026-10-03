import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  initializeRotflOrderRuntime,
  advanceRotflOrderRuntime,
  readRotflOrderRuntime,
  requireRotflMutationAdmission,
  rotflMutationCommandClass,
} from '../src/preflight/order-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-oor-runtime-'));
const state=path.join(root,'order.current.json');
const generation='sdk:test:g1';
const managed_current={
  provider_current_ref:'github:xi-io-sdk@test',
  studio_handoff_ref:'studio:handoff:test',
  studio_session_ingress_ref:'studio:session:test',
  current_selector_ref:'studio:selector:test',
  waterfall_ref:'waterfall:test',
  registered_backlog_ref:'backlog:test',
  waterfall_generation:'g1',
  registered_backlog_generation:'g1',
  owner_restatement_count:0,
};

try {
  const missing=requireRotflMutationAdmission({state_path:state,current_source_generation:generation});
  assert.equal(missing.admitted,false);
  assert.equal(missing.first_red,'ROTFL_OOR_RUNTIME_STATE_MISSING');

  const init=initializeRotflOrderRuntime({source_generation:generation,managed_current,state_path:state});
  assert.equal(init.state,'PASS');
  assert.equal(init.order.current_step_id,'O0');
  assert.equal(init.mutation_admitted,false);

  const skip=advanceRotflOrderRuntime({
    step_id:'O1',evidence_ref:'e:O1',preflight_ref:'p:O1',
    current_source_generation:generation,state_path:state
  });
  assert.equal(skip.state,'FAIL');
  assert.equal(skip.first_red,'ROTFL_OOR_ADVANCE_NOT_NEXT_STEP');

  const missingProof=advanceRotflOrderRuntime({
    step_id:'O0',evidence_ref:'',preflight_ref:'p:O0',
    current_source_generation:generation,state_path:state
  });
  assert.equal(missingProof.state,'FAIL');
  assert.equal(missingProof.first_red,'ROTFL_OOR_ADVANCE_REQUIRES_EVIDENCE_AND_PREFLIGHT');

  for(let i=0;i<=10;i++){
    const id='O'+i;
    const advanced=advanceRotflOrderRuntime({
      step_id:id,
      evidence_ref:`evidence:${id}`,
      preflight_ref:`preflight:${id}`,
      current_source_generation:generation,
      state_path:state,
    });
    assert.equal(advanced.state,'PASS',id);
    assert.equal(advanced.advanced,true,id);
  }

  const beforeO11=readRotflOrderRuntime({state_path:state});
  assert.equal(beforeO11.order.current_step_id,'O11');
  assert.equal(beforeO11.order.mutation_admitted,false);
  const blocked=requireRotflMutationAdmission({state_path:state,current_source_generation:generation});
  assert.equal(blocked.admitted,false);
  assert.equal(blocked.first_red,'ROTFL_OOR_O11_NOT_COMPLETE');

  const drift=advanceRotflOrderRuntime({
    step_id:'O11',
    evidence_ref:'evidence:O11',
    preflight_ref:'preflight:O11',
    current_source_generation:'sdk:test:g2',
    state_path:state,
  });
  assert.equal(drift.state,'FAIL_CURRENT');
  assert.equal(drift.first_red,'ROTFL_OOR_SOURCE_GENERATION_DRIFT');

  const o11=advanceRotflOrderRuntime({
    step_id:'O11',
    evidence_ref:'evidence:O11',
    preflight_ref:'preflight:O11',
    current_source_generation:generation,
    state_path:state,
  });
  assert.equal(o11.state,'PASS');
  assert.equal(o11.order.current_step_id,'O12');
  assert.equal(o11.order.mutation_admitted,true);

  const admitted=requireRotflMutationAdmission({state_path:state,current_source_generation:generation});
  assert.equal(admitted.admitted,true);
  assert.equal(admitted.authority_granted,false);
  assert.equal(admitted.provider_effect,false);

  const stale=requireRotflMutationAdmission({state_path:state,current_source_generation:'sdk:test:g2'});
  assert.equal(stale.admitted,false);
  assert.equal(stale.first_red,'ROTFL_OOR_SOURCE_GENERATION_DRIFT');

  for(const [argv,expected] of [
    [['--execute'],true],
    [['pneuma','--exec-rotfl'],true],
    [['cargo','--execute','--','build'],true],
    [['zed','ibal','recover'],true],
    [['runner','recover'],true],
    [['inbox','recover'],true],
    [['hex','install'],true],
    [['hex','start'],true],
    [['studio','start'],true],
    [['status','--json'],false],
    [['ack','order','status'],false],
    [['ack','order','advance'],false],
  ]){
    assert.equal(rotflMutationCommandClass(argv).mutation,expected,argv.join(' '));
  }

  console.log(JSON.stringify({
    schema:'xiio.sdk.rotfl-order-runtime-hostile/v1',
    state:'PASS',
    mutation_before_o11:'BLOCKED',
    mutation_after_o11:'ADMITTED_NO_EFFECT_AUTHORITY',
    generation_drift:'BLOCKED',
    illegal_skip:'BLOCKED',
    missing_proof:'BLOCKED',
    command_classification:'PASS',
    provider_effects:0,
  }));
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}
