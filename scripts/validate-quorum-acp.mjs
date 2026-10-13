import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { QuorumAcp, readMailThread } from '../src/cli/quorum-acp.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiio-quorum-acp-'));
const ledger=path.join(root,'internal-ai-mail.jsonl');
const updates=[],requests=[];let sequence=0;let isolated=true;
const client={sessionUpdate:async p=>updates.push(p)};
const append=async row=>fs.appendFile(ledger,JSON.stringify(row)+'\n');
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const fetchImpl=async (url,options)=>{
 const body=options.body?JSON.parse(options.body):null;requests.push({url,body});
 if(url.endsWith('/api/bridge/register')) return response({ok:true});
 if(url.endsWith('/api/bridge/seats')) return response({seats:[{identity:'agent:zed:r1'},{identity:'agent:cursor:r1'},{identity:'agent:critic:r1'}]});
 if(url.endsWith('/cli/v1/mail/send')) {
  const row={message_id:`test-${++sequence}`,thread_ref:body.thread_ref,from_agent:body.from_agent,to_agent_or_role:body.to,body:body.body,created_at:new Date().toISOString()};
  await append(row);return response({message:row,coordination_ok:false},409);
 }
 if(url.endsWith('/v1/status')) return response({conversation_context_supported:isolated});
 if(url.endsWith('/v1/turn')) return response({state:'ANSWERED',reply:'local reply'});
 if(url.endsWith('/api/quorum/current')) return response({pipeline:{current:'COMPARE'},assignment:{assignee:'agent:cursor:r1'}});
 if(url.endsWith('/api/quorum/advance')) return response({ok:true,seat:body.seat,prefer_assignee:body.prefer_assignee});
 if(url.endsWith('/api/quorum/assign')) return response({ok:true,assignment:body});
 throw new Error('UNEXPECTED_ROUTE:'+url);
};
const manager=new QuorumAcp({ledger,stateDir:path.join(root,'sessions'),fetchImpl,pollMs:60000});
try {
 await append({message_id:'other',thread_ref:'another-thread',from_agent:'owner:zed',body:'MUST_NOT_LEAK',created_at:'2026-01-01'});
 const {sessionId}=await manager.newSession({cwd:root},client);const s=manager.sessions.get(sessionId);
 const ask=text=>manager.prompt({sessionId,prompt:[{type:'text',text}]},client);
 const beforeUnaddressed=requests.length;
 await ask('/send do not deliver without recipients');
 assert.equal(requests.length,beforeUnaddressed,'unaddressed send must not write mail');
 await ask('/participants agent:cursor:r1,agent:critic:r1');
 assert.deepEqual(s.participants,['agent:cursor:r1','agent:critic:r1']);
 await ask('one message');
 let rows=await manager.history(s);assert.equal(rows.length,2);assert.equal(rows[0].body,'one message');assert.equal(rows[1].body,'local reply');
 const turn=requests.find(r=>r.url.endsWith('/v1/turn'));assert.equal(turn.body.conversation_ref,s.threadRef);assert.deepEqual(turn.body.context,[]);
 assert.deepEqual(requests.find(r=>r.url.endsWith('/cli/v1/mail/send')).body.to,s.participants);
 assert.ok(updates.some(p=>p.update.content.text.includes('LEDGER_ONLY')),'never equate stored with consumed');
 await ask('/advance');assert.equal(requests.find(r=>r.url.endsWith('/api/quorum/advance')).body.prefer_assignee,'agent:zed:r1');
 await ask('/assign agent:critic:r1 inspect one change');assert.equal(requests.find(r=>r.url.endsWith('/api/quorum/assign')).body.assignee,'agent:critic:r1');
 const assigns=requests.filter(r=>r.url.endsWith('/api/quorum/assign')).length;
 await ask('/assign agent:unknown arbitrary');assert.equal(requests.filter(r=>r.url.endsWith('/api/quorum/assign')).length,assigns);
 const peer={message_id:'peer-return',thread_ref:s.threadRef,from_agent:'agent:critic:r1',body:'x'.repeat(600),created_at:'2099-01-01'};
 await append(peer);const count=updates.length;await manager.poll(s);await manager.poll(s);assert.equal(updates.length,count+1);assert.ok(updates.at(-1).update.content.text.includes(peer.body),'full body, not 240-character preview');
 await ask('follow up');assert.ok(requests.filter(r=>r.url.endsWith('/v1/turn')).at(-1).body.context.some(x=>x.content.includes(peer.body)));
 assert.ok(!JSON.stringify(requests).includes('MUST_NOT_LEAK'),'different thread never reaches the model');
 const metadata=await fs.readFile(path.join(root,'sessions',sessionId+'.json'),'utf8');assert.ok(!metadata.includes('local reply'),'no parallel conversation store');
 manager.close();
 const resumed=new QuorumAcp({ledger,stateDir:path.join(root,'sessions'),fetchImpl,pollMs:60000});
 try {
  const before=updates.length;await resumed.loadSession({sessionId,cwd:root},client);assert.ok(updates.length>before);
  const shown=updates.length;await resumed.poll(resumed.sessions.get(sessionId));assert.equal(updates.length,shown,'replayed history is not emitted again');
  await assert.rejects(()=>resumed.loadSession({sessionId,cwd:'/wrong'},client),/WORKSPACE_MISMATCH/);
  const t=requests.filter(r=>r.url.endsWith('/v1/turn')).length;isolated=false;
  await resumed.prompt({sessionId,prompt:[{type:'text',text:'must fail closed'}]},client);
  assert.equal(requests.filter(r=>r.url.endsWith('/v1/turn')).length,t);
 } finally {resumed.close();}
 assert.throws(()=>new QuorumAcp({controlBase:'https://example.com'}),/LOOPBACK/);
 assert.throws(()=>new QuorumAcp({agentBase:'http://user:secret@127.0.0.1:3109'}),/LOOPBACK/);
 await append({...peer,body:'conflict'});await assert.rejects(()=>readMailThread(ledger,s.threadRef),/IDENTITY_CONFLICT/);
 console.log('QUORUM_ACP=PASS thread isolation, full history, recipient routing, Zed preference, live-return dedup, resume, metadata-only state, fail-closed transport');
} finally {manager.close();await fs.rm(root,{recursive:true,force:true});}
