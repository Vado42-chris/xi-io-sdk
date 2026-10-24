#!/usr/bin/env node
// Independent source-adapter hostile. No provider/model contact, temp workspace only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const main=path.join(repo,'bin/xi.mjs');
const direct=path.join(repo,'bin/xi-local-agent.mjs');
const originHead=spawnSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'});
const head=originHead.status===0?originHead.stdout.trim():null;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-entrylife-'));
const marker='synthetic-ROTFL-write-marker.txt';
const preload=path.join(dir,'fake-ollama-preload.mjs');
const allowedMark=Buffer.from('synthetic lifecycle test only\n');
fs.writeFileSync(preload,[
 'globalThis.fetch=async(url,{body}={})=>{',
 ' const parsed=new URL(String(url));',
 ' if(parsed.hostname!=="127.0.0.1"||parsed.port!=="11434"||parsed.pathname!=="/api/chat"){throw Error("ALL_EXTERNAL_NETWORK_DENIED_BY_TEST");}',
 ' const request=JSON.parse(body||"{}");',
 ' const wrote=request.messages.some(row=>row?.role==="tool");',
 ' const message=wrote?{role:"assistant",content:"A synthetic file was created by the local native edit tool."}',
 '   :{role:"assistant",tool_calls:[{function:{name:"edit_workspace_text_file",',
 '     arguments:{path:'+JSON.stringify(marker)+',operation:"create",new_text:"synthetic lifecycle test only\\n"}}}]};',
 ' return {ok:true,json:async()=>({message})};',
 '};',
].join('\n'));
const env={
 ...process.env,
 HOME:dir,
 XDG_STATE_HOME:path.join(dir,'state'),
 XIIO_OOR_STATE_PATH:path.join(dir,'missing-oor-state.json'),
 XIIO_OLLAMA_MODEL:'test-model-fake-loopback-only',
 NODE_OPTIONS:'--import='+preload,
};
const child=(file,flags)=>{
 const run=spawnSync(process.execPath,[file,...flags],{
   cwd:dir,env,input:'ROTFL synthetic request for a simple local edit. No provider effects.',
   encoding:'utf8',timeout:15000,maxBuffer:1_000_000,
 });
 assert.equal(run.error,undefined,String(run.error));
 let result;
 try{result=JSON.parse(run.stdout);}catch{throw Error('RESULT_NOT_JSON '+run.stdout.slice(0,400)+' '+run.stderr.slice(0,400));}
 return {status:run.status,result,stderr:run.stderr};
};
try{
 const fromCli=child(main,['chat','--execute','--once']);
 assert.equal(fromCli.status,2,'existing CLI must enforce ROTFL-OOR preflight');
 assert.equal(fromCli.result.schema,'xiio.cli.rotfl-oor-block/v1');
 assert.equal(fromCli.result.state,'BLOCKED');
 assert.equal(fromCli.result.admission?.admitted,false);
 assert.equal(fs.existsSync(path.join(dir,marker)),false,'CLI refused any fixture writes');
 const fromDirect=child(direct,['--execute','--once']);
 const wrote=fs.existsSync(path.join(dir,marker));
 if(wrote)assert.deepEqual(fs.readFileSync(path.join(dir,marker)),allowedMark);
 const bypass=fromDirect.result.schema==='xiio.cli.local-one-shot/v1'
   && fromDirect.result.status==='PASS_LOCAL' && wrote;
 const sourcePass=fromCli.result.state==='BLOCKED' && !bypass;
 const report={
   schema:'xiio.sdk.actual-local-agent-lifecycle-entry-hostile/v1',
   state:sourcePass?'PASS':'FAIL_CURRENT',
   source_generation:head,
   adapter_paths:['bin/xi.mjs','bin/xi-local-agent.mjs'],
   expected:'all entrypoints deny effectful tool dispatch with no authenticated current lifecycle',
   cli_preflight:{exit:fromCli.status,state:fromCli.result.state,
     first_red:fromCli.result.admission?.first_red,real_effect:false},
   direct_preflight:{exit:fromDirect.status,state:fromDirect.result.status,
     first_red:fromDirect.result.first_red||null,
     synthetic_file_written:wrote},
   first_red:bypass?'SDK_DIRECT_LOCAL_AGENT_BYPASSES_SHARED_OOR_AND_WORK_ADMISSION':null,
   actual_model_calls:0,real_provider_effects:0,
   synthetic_local_file_effects:wrote?1:0,
   original_Work_admitted:false,
   installed_Aries_consumer_qualified:false,
   root_work_or_matter_resolver_qualified:false,
 };
 console.log(JSON.stringify(report,null,2));
 if(process.argv.includes('--require-fixed')&&!sourcePass)process.exitCode=2;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
