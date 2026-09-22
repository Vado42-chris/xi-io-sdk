#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compileProjectionArray,writeProjectionArray,readProjectionArray,corruptProjectionReplicaForTest} from '../src/local/projection-array.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-array-'));
const studio=path.join(tmp,'studio','SEARCH.index.json');
const base={
 root_uuid:'5267f93e-2af8-57c8-975d-21fcbf77683e',
 work_uuid:'d4a4906a-80ec-54ed-aeb1-364154a486a9',
 generation_ref:'search:g1',
 project_ref:'xi-io:search',
 current_selector_ref:'xiio/projects/search/project-current.json',
 privacy_class:'INTERNAL',
 denominator_ref:'SEARCH_100S_G1',
 first_red:'A10',
 next_machine_action:'RUN_PROGRESSIVE_INGRESS',
 brief:{counts:{pass:75,fail:3,wait:22},first_red:'A10'},
 payload:{current:{state:'SILVER'},rooms:['10A','10J'],private_payload_allowed_locally:true},
 source_refs:['ref:a','ref:b']
};
const compiled=compileProjectionArray(base);
assert.match(compiled.envelope.projection_uuid,/^[0-9a-f-]{36}$/);
assert.equal(compiled.index.payload_included,false);
const w=writeProjectionArray(compiled,{state_root:tmp,studio_index_path:studio});
assert.equal(w.replica_count,2);
assert.equal(w.studio_payload_replica,false);
let r=readProjectionArray({...base,state_root:tmp,studio_index_path:studio,require_studio_index:true});
assert.equal(r.state,'READY');
assert.equal(r.studio_index_state,'INDEX_MATCH');
assert.equal(r.view,'BRIEF');
assert.equal(r.worker_qualified,false);

corruptProjectionReplicaForTest({...base,state_root:tmp,replica:'b'});
r=readProjectionArray({...base,state_root:tmp,studio_index_path:studio,require_studio_index:true});
assert.equal(r.state,'READY');
assert.deepEqual(r.healed,['replica-b']);
const after=readProjectionArray({...base,state_root:tmp,studio_index_path:studio,require_studio_index:true,auto_heal:false});
assert.equal(after.state,'READY');
assert.equal(after.valid_local_replicas,2);

const idx=JSON.parse(fs.readFileSync(studio,'utf8'));
idx.content_digest='sha256:'+'0'.repeat(64);
fs.writeFileSync(studio,JSON.stringify(idx));
r=readProjectionArray({...base,state_root:tmp,studio_index_path:studio,require_studio_index:true});
assert.equal(r.state,'WAIT_INDEX_RECONCILIATION');
assert.equal(r.studio_index_state,'INDEX_DRIFT');

const fresh=path.join(tmp,'fresh');
writeProjectionArray(compiled,{state_root:fresh});
r=readProjectionArray({...base,state_root:fresh,require_studio_index:false});
assert.equal(r.state,'READY');
assert.equal(r.studio_index_state,'INDEX_MATCH');

console.log(JSON.stringify({
 schema:'xiio.sdk.local-projection-array-check/v1',
 result:'PASS',
 local_payload_replicas:2,
 studio_index_shards:1,
 studio_payload_replicas:0,
 self_heal_proven:true,
 index_drift_detected:true,
 privacy_payload_not_written_to_studio_index:true,
 worker_qualification_credit:0,
 provider_effect:0
},null,2));
