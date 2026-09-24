#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-studio-fractal-ledger-'));
const ledgerPath=path.join(tmp,'fractal-receipts.current.json');
const ledger={
  schema:'xiio.studio.fractal-consumer-receipt-ledger/v1',
  generation:'studio:receipts:g1',
  canonical_vector:{
    packet_id:'packet:1',
    generation:'packet:g1',
    semantic_digest:'sem:1',
    blast_radius_digest:'blast:1',
    affected_refs:['bins','hex','studio'],
    return_targets:['return:hex','return:studio'],
    first_red:'Q_SEARCH_BINS'
  },
  expected_receipt_denominator:32,
  verified_count:7,
  na_count:1,
  wait_count:24,
  fail_count:0,
  closure_100:false,
  state:'TRUE_WAIT',
  first_red:{consumer_id:'HEX',scale:'MICRO',state:'WAIT_MISSING_RECEIPT'}
};
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));

const run=spawnSync(process.execPath,['bin/xi.mjs','studio','fractal','--json'],{
  encoding:'utf8',
  env:{...process.env,XIIO_FRACTAL_RECEIPT_LEDGER_PATH:ledgerPath}
});
assert.equal(run.status,0,run.stderr);
const body=JSON.parse(run.stdout);
assert.equal(body.schema,'xiio.cli.studio-fractal-ledger/v1');
assert.equal(body.state,'PASS');
assert.equal(body.generation,ledger.generation);
assert.equal(body.closure_100,false);
assert.equal(body.expected_receipt_denominator,32);
assert.equal(body.verified_count,7);
assert.equal(body.wait_count,24);
assert.equal(body.fail_count,0);
assert.deepEqual(body.canonical_vector,ledger.canonical_vector);
assert.deepEqual(body.ledger,ledger);

const missing=spawnSync(process.execPath,['bin/xi.mjs','studio','fractal','--json'],{
  encoding:'utf8',
  env:{...process.env,XIIO_FRACTAL_RECEIPT_LEDGER_PATH:path.join(tmp,'missing.json')}
});
const missingBody=JSON.parse(missing.stdout);
assert.equal(missingBody.state,'TRUE_WAIT');
assert.equal(missingBody.first_red,'FRACTAL_RECEIPT_LEDGER_UNREADABLE');

fs.writeFileSync(ledgerPath,JSON.stringify({schema:'wrong'},null,2));
const wrong=spawnSync(process.execPath,['bin/xi.mjs','studio','fractal','--json'],{
  encoding:'utf8',
  env:{...process.env,XIIO_FRACTAL_RECEIPT_LEDGER_PATH:ledgerPath}
});
const wrongBody=JSON.parse(wrong.stdout);
assert.equal(wrongBody.state,'BLOCKED');
assert.equal(wrongBody.first_red,'FRACTAL_RECEIPT_LEDGER_SCHEMA_INVALID');

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.sdk.cli-studio-fractal-ledger-check/v1',
  state:'PASS',
  exact_projection:true,
  missing_waits:true,
  schema_drift_blocks:true,
  effect_authority:0
},null,2));
