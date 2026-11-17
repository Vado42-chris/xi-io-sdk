import assert from 'node:assert/strict';
import http from 'node:http';
import {test} from 'node:test';
import {tmpdir} from 'node:os';
import {compileLocalCompass} from '../src/compass/local-truth.mjs';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close=server=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));};
async function observe(origin){
 return compileLocalCompass({cwd:tmpdir(),env:{HOME:tmpdir(),OLLAMA_HOST:origin,XIIO_API_GLASS_BOX_READ_URL:origin+'/glass',XIIO_COMPASS_PROVIDER_READ:'0'},providerRead:false,exec:()=>({ok:false,stdout:'',stderr:'',status:1}),runtimeInspect:()=>({state:'ABSENT_LISTENER'})});
}
for(const status of [301,302,303,307,308])test(`compass refuses ${status} receiver substitution before a second request`,async()=>{
 let replacementRequests=0;
 const replacement=http.createServer((req,res)=>{replacementRequests++;res.setHeader('Content-Type','application/json');res.end('{"schema":"synthetic.receiver/v1"}');});
 const target=await listen(replacement);
 const original=http.createServer((req,res)=>{res.writeHead(status,{Location:target+'/replacement'});res.end();});
 const origin=await listen(original);
 try{
  const result=await observe(origin);
  assert.equal(replacementRequests,0);
  for(const key of ['ollama','api_glass_box']){
   assert.equal(result.runtime[key].state,'WAIT_UNREACHABLE');
   assert.equal(result.runtime[key].status,null);
  }
  for(const id of ['OLLAMA','API_GLASS_BOX'])assert.equal(result.cells.find(row=>row.id===id).state,'RED');
  assert.equal(result.provider_effect,false);assert.equal(result.authority_granted,false);
 }finally{await close(original);await close(replacement);}
});
test('compass preserves direct configured receiver readback',async()=>{
 const paths=[];
 const server=http.createServer((req,res)=>{paths.push(req.url);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({schema:'synthetic.direct/v1',operation_id:'direct-read'}));});
 const origin=await listen(server);
 try{
  const result=await observe(origin);
  assert.deepEqual(paths,['/api/tags','/glass']);
  for(const key of ['ollama','api_glass_box']){
   assert.equal(result.runtime[key].state,'PASS');assert.equal(result.runtime[key].schema,'synthetic.direct/v1');
   assert.equal(result.runtime[key].operation_id,'direct-read');
  }
  assert.equal(result.provider_effect,false);assert.equal(result.authority_granted,false);
 }finally{await close(server);}
});
test('compass preserves direct HTTP refusal without authority',async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(503);res.end('{}');});
 const origin=await listen(server);
 try{
  const result=await observe(origin);
  for(const key of ['ollama','api_glass_box']){assert.equal(result.runtime[key].state,'FAIL');assert.equal(result.runtime[key].status,503);}
  assert.equal(result.provider_effect,false);assert.equal(result.authority_granted,false);
 }finally{await close(server);}
});
