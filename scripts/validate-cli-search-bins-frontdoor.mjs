#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  res.setHeader('content-type','application/json');
  if(url.pathname==='/api/search/status'){
    res.writeHead(200);
    return res.end(JSON.stringify({schema:'xiio.search.execution-status/v1',ok:true,targets:[{id:'files',adapter_state:'LOCAL_RUNTIME_CANDIDATE'}],provider_effect:false,effect_authority:0}));
  }
  if(url.pathname==='/api/search/query'){
    assert.equal(url.searchParams.get('target'),'files');
    assert.equal(url.searchParams.get('q'),'NOA');
    assert.equal(url.searchParams.get('limit'),'5');
    const vector=JSON.parse(url.searchParams.get('fractal_vector')||'null');
    assert.equal(vector?.packet_id,'packet:cli-search');
    assert.equal(vector?.blast_radius_digest,'blast:cli-search');
    res.writeHead(200);
    return res.end(JSON.stringify({
      schema:'xiio.search.local-files-runtime-result/v1',
      ok:true,
      target_id:'files',
      result_count:1,
      source_file_custody_count:1,
      source_file_wait_count:0,
      result_set_custody_ok:true,
      fractal_vector:vector,
      result_set:{results:[{id:'file:test',bins_ref:{resource_ref:'bins:r1',version_ref:'bins:r1:v1',sha256:'a'.repeat(64)}}]},
      provider_effect:false,
      effect_authority:0
    }));
  }
  res.writeHead(404);res.end(JSON.stringify({error:'not_found'}));
});

await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',(err)=>err?reject(err):resolve()));
const port=server.address().port;
const env={...process.env,XIIO_INBOX_ORIGIN:`http://127.0.0.1:${port}`,XIIO_INVOKED_AS:'xi-io'};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-cli-search-vector-'));
const vectorPath=path.join(tmp,'vector.json');
const vector={
  packet_id:'packet:cli-search',
  generation:'g1',
  semantic_digest:'sem:cli-search',
  blast_radius_digest:'blast:cli-search',
  affected_refs:['bins','hex','search'],
  return_targets:['return:bins','return:hex','return:search'],
  first_red:'Q_LOCAL_FILE_CUSTODY'
};
fs.writeFileSync(vectorPath,JSON.stringify(vector,null,2));

async function run(args){
  return await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['bin/xi.mjs',...args],{cwd:root,env});
    let stdout='',stderr='';
    child.stdout.on('data',c=>stdout+=c);
    child.stderr.on('data',c=>stderr+=c);
    child.on('error',reject);
    child.on('close',code=>resolve({code,stdout,stderr}));
  });
}

try{
  const status=await run(['search','status']);
  assert.equal(status.code,0,status.stderr);
  const sj=JSON.parse(status.stdout);
  assert.equal(sj.schema,'xiio.cli.search/v1');
  assert.equal(sj.state,'PASS');

  const query=await run(['search','--target','files','--query','NOA','--limit','5','--vector',vectorPath]);
  assert.equal(query.code,0,query.stderr);
  const qj=JSON.parse(query.stdout);
  assert.equal(qj.schema,'xiio.search.local-files-runtime-result/v1');
  assert.equal(qj.transport,'CLI_TO_INBOX_SEARCH_API');
  assert.equal(qj.target_id,'files');
  assert.equal(qj.source_file_custody_count,1);
  assert.equal(qj.result_set.results[0].bins_ref.version_ref,'bins:r1:v1');
  assert.deepEqual(qj.fractal_vector,vector);
  assert.deepEqual(qj.requested_fractal_vector,vector);

  const badPath=path.join(tmp,'bad.json');
  fs.writeFileSync(badPath,JSON.stringify({packet_id:'bad'}));
  const bad=await run(['search','--target','files','--query','NOA','--vector',badPath]);
  assert.notEqual(bad.code,0);
  const badBody=JSON.parse(bad.stdout);
  assert.match(badBody.first_red,/FRACTAL_VECTOR_FIELD_REQUIRED/);

  console.log(JSON.stringify({
    schema:'xiio.sdk.cli-search-bins-frontdoor-test/v1',
    state:'PASS',
    assertions:14,
    fractal_vector_transport:true,
    incomplete_vector_blocked:true
  },null,2));
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
  await new Promise(resolve=>server.close(resolve));
}
