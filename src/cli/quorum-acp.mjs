/** Zed ACP transport over the existing Ibal controller and AI Mail; no new server or conversation store. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

export const QUORUM_ACP_SCHEMA = 'xiio.zed.quorum-acp/v1';
const refPattern = /^[A-Za-z0-9:_.-]{1,256}$/;
const sessionPattern = /^[a-f0-9-]{36}$/;
export const HELP = `Ibal quorum — Zed alpha

Write normally to talk to local Ibal. Your turn and reply stay in AI Mail.
/quorum — inspect the live quorum and registered seats
/participants agent:one,agent:two — select recipients for this conversation
/send message — send one message to those recipients (delivery is not execution)
/assign agent:seat task — assign work through the existing quorum controller
/advance — ask the existing controller for the next step, preferring Zed
/history — read this conversation from AI Mail

Replies arriving in this AI Mail thread appear here automatically. A registered
seat still needs a running consumer to receive work. No provider tab is controlled by this adapter.`;

function loopbackBase(value) {
  const u = new URL(value);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('LOOPBACK_URL_REQUIRED');
  return u.origin;
}
function reference(value) {
  if (typeof value !== 'string' || !refPattern.test(value)) throw new Error('REFERENCE_INVALID');
  return value;
}

export async function readMailThread(ledger, threadRef, limit = 100) {
  const rows = [];
  const files = [ledger];
  const threadDir = path.join(path.dirname(ledger), 'threads');
  try { for (const name of await fs.readdir(threadDir)) if (name.endsWith('.jsonl')) files.push(path.join(threadDir,name)); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const file of files) {
    try { await fs.access(file); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    const stream = createReadStream(file, {encoding:'utf8'});
    const lines = createInterface({input:stream,crlfDelay:Infinity});
    try {
      for await (const line of lines) {
        let row; try { row=JSON.parse(line); } catch { continue; }
        if (row.thread_ref !== threadRef || !row.message_id) continue;
        rows.push(row);
      }
    } finally { lines.close(); stream.destroy(); }
  }
  rows.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
  const byId = new Map();
  for (const row of rows) {
    const previous=byId.get(row.message_id);
    if (previous && (previous.body !== row.body || previous.from_agent !== row.from_agent)) throw new Error('MAIL_IDENTITY_CONFLICT');
    byId.set(row.message_id,row);
  }
  return [...byId.values()].slice(-limit);
}

export class QuorumAcp {
  constructor({controlBase='http://127.0.0.1:8798',agentBase='http://127.0.0.1:3109',
    ledger=path.join(os.homedir(),'.local/state/xi-io/flatplane/ai-mail/internal-ai-mail.jsonl'),
    stateDir=path.join(os.homedir(),'.local/state/xi-io/zed-quorum'),
    threadRef=null,fetchImpl=fetch,readThread=readMailThread,pollMs=10000}={}) {
    this.control=loopbackBase(controlBase);this.agent=loopbackBase(agentBase);
    this.ledger=ledger;this.stateDir=stateDir;this.defaultThread=threadRef===null?null:reference(threadRef);
    this.fetch=fetchImpl;this.readThread=readThread;this.pollMs=pollMs;this.sessions=new Map();
  }
  async request(base,route,body,signal) {
    const r=await this.fetch(base+route,{method:body===undefined?'GET':'POST',redirect:'error',headers:body===undefined?{}:{'content-type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(125000)]):AbortSignal.timeout(15000)});
    const data=await r.json();
    if(!r.ok && !(route==='/cli/v1/mail/send' && data.message?.message_id)) throw new Error(`HTTP_${r.status}:${data.reason||data.first_red||data.error||route}`);
    return data;
  }
  async save(s) {
    await fs.mkdir(this.stateDir,{recursive:true,mode:0o700});
    // Metadata only. Conversation text is read from AI Mail, never saved here.
    const metadata={sessionId:s.sessionId,cwd:s.cwd,threadRef:s.threadRef,participants:s.participants,updatedAt:new Date().toISOString()};
    await fs.writeFile(path.join(this.stateDir,s.sessionId+'.json'),JSON.stringify(metadata)+'\n',{mode:0o600});
  }
  async text(s,text) { await s.client.sessionUpdate({sessionId:s.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}}); }
  async history(s) { return this.readThread(this.ledger,s.threadRef); }
  async register(s) {
    const registered=await this.request(this.control,'/api/bridge/register',{
      identity:'agent:zed:r1',provider:'zed',current_task:s.threadRef,
      capabilities:{read_repo:false,write_repo:false,reason:true,filesystem:false,terminal:false,patch:false,quorum_control:true,ai_mail:true},
      evidence_ref:`acp-session:${s.sessionId}`,
    });
    if(registered.ok!==true) throw new Error('ZED_REGISTRATION_REFUSED');
  }
  async newSession({cwd},client) {
    if(typeof cwd!=='string'||!path.isAbsolute(cwd)) throw new Error('WORKSPACE_ABSOLUTE_REQUIRED');
    const sessionId=randomUUID();
    const s={sessionId,cwd,threadRef:this.defaultThread||`xiio:zed:quorum:${sessionId}`,participants:[],client,seen:new Set(),busy:false};
    for(const row of await this.history(s)) s.seen.add(row.message_id);
    await this.register(s);await this.save(s);this.sessions.set(sessionId,s);this.watch(s);
    return {sessionId};
  }
  async loadSession({sessionId,cwd},client) {
    if(!sessionPattern.test(sessionId||'')) throw new Error('SESSION_ID_INVALID');
    const data=JSON.parse(await fs.readFile(path.join(this.stateDir,sessionId+'.json'),'utf8'));
    if(data.cwd!==cwd) throw new Error('SESSION_WORKSPACE_MISMATCH');
    reference(data.threadRef);
    const old=this.sessions.get(sessionId);if(old?.busy) throw new Error('SESSION_BUSY');if(old?.timer) clearInterval(old.timer);
    const s={...data,client,seen:new Set(),busy:true};
    this.sessions.set(sessionId,s);
    for(const row of await this.history(s)) {
      const owner=row.from_agent==='owner:zed';
      await client.sessionUpdate({sessionId,update:{sessionUpdate:owner?'user_message_chunk':'agent_message_chunk',content:{type:'text',text:owner?row.body:`${row.from_agent}: ${row.body}\n`}}});
      s.seen.add(row.message_id);
    }
    s.busy=false;await this.register(s);this.watch(s);return {};
  }
  watch(s) {
    s.timer=setInterval(()=>this.poll(s).catch(()=>{}),this.pollMs);s.timer.unref?.();
  }
  async poll(s) {
    if(s.busy||s.polling) return;
    s.polling=true;
    try {
      for(const row of await this.history(s)) {
        if(s.seen.has(row.message_id)) continue;
        await this.text(s,`\n${row.from_agent}: ${row.body}\n`);s.seen.add(row.message_id);
      }
    } catch(e) { if(s.lastPollError!==e.message){s.lastPollError=e.message;await this.text(s,`\nAI Mail read blocked: ${e.message}\n`);} }
    finally{s.polling=false;}
  }
  async record(s,body,{from='owner:zed',to=s.participants.length?s.participants:['agent:ibal:r1'],subject='Zed quorum turn'}={}) {
    const result=await this.request(this.control,'/cli/v1/mail/send',{from_agent:from,to,subject,body,thread_ref:s.threadRef,project_or_client:'xi-io-studio',root_ref:`conversation:${s.threadRef}`},s.abort?.signal);
    const id=result.message?.message_id;
    const readback=id&&(await this.history(s)).find(row=>row.message_id===id);
    if(!readback||readback.body!==body||readback.from_agent!==from) throw new Error('MAIL_WRITE_READBACK_FAILED');
    s.seen.add(id);
    return {id,delivery:result.coordination_ok===true?'DELIVERED_TO_BUS':'LEDGER_ONLY'};
  }
  async prompt({sessionId,prompt},client) {
    const s=this.sessions.get(sessionId);if(!s) throw new Error('SESSION_NOT_LOADED');if(s.busy) throw new Error('SESSION_BUSY');
    if(!Array.isArray(prompt)||prompt.some(c=>c.type!=='text')) throw new Error('TEXT_PROMPT_REQUIRED');
    const input=prompt.map(c=>c.text||'').join('\n').trim();
    if(!input||input.length>16000) throw new Error('PROMPT_SIZE_INVALID');
    s.client=client;s.busy=true;s.abort=new AbortController();
    try {
      let result;
      if(input==='/help') result=HELP;
      else if(input==='/history') result=(await this.history(s)).map(m=>`${m.from_agent}: ${m.body}`).join('\n\n')||'No messages in this conversation yet.';
      else if(input.startsWith('/participants ')) {
        const ids=input.slice(14).split(',').map(x=>reference(x.trim()));
        if(ids.length>12) throw new Error('PARTICIPANT_LIMIT');
        const roster=await this.request(this.control,'/api/bridge/seats');
        for(const id of ids) if(!roster.seats?.some(x=>x.identity===id)) throw new Error('UNKNOWN_SEAT:'+id);
        s.participants=[...new Set(ids)];await this.save(s);
        result=`Recipients: ${s.participants.join(', ')}. Registration does not prove a running worker.`;
      } else {
        if(input.startsWith('/send ') && !s.participants.length) throw new Error('SELECT_PARTICIPANTS_FIRST');
        const prior=await this.history(s);
        const owner=await this.record(s,input.startsWith('/send ')?input.slice(6):input);
        await this.text(s,`AI Mail: ${owner.id} (${owner.delivery})\n`);
        if(input==='/quorum'||input==='/quorum status') {
          const current=await this.request(this.control,'/api/quorum/current');
          const roster=await this.request(this.control,'/api/bridge/seats');
          result=JSON.stringify({thread_ref:s.threadRef,quorum:current,seats:roster.seats},null,2);
        } else if(input==='/advance') {
          result=JSON.stringify(await this.request(this.control,'/api/quorum/advance',{seat:'agent:zed:r1',prefer_assignee:'agent:zed:r1'},s.abort.signal),null,2);
        } else if(input.startsWith('/assign ')) {
          const match=/^\/assign (\S+)\s+([\s\S]+)$/.exec(input);if(!match) throw new Error('ASSIGN_SEAT_AND_TASK_REQUIRED');
          const assignee=reference(match[1]);
          const roster=await this.request(this.control,'/api/bridge/seats');
          if(!roster.seats?.some(x=>x.identity===assignee)) throw new Error('UNKNOWN_SEAT:'+assignee);
          result=JSON.stringify(await this.request(this.control,'/api/quorum/assign',{assignee,next_action:match[2],return_target:`ai-mail:thread:${s.threadRef}`,from_agent:'agent:zed:r1'},s.abort.signal),null,2);
        } else if(input.startsWith('/send ')) {
          result=`Message ${owner.id} is in ${s.threadRef} for ${s.participants.join(', ')}. Waiting for their actual replies; no worker execution is claimed.`;
        } else if(input.startsWith('/')) {
          result=HELP;
        } else {
          const health=await this.request(this.agent,'/v1/status');
          if(health.conversation_context_supported!==true) throw new Error('LOCAL_AGENT_CONVERSATION_ISOLATION_REQUIRED');
          // Only the canonical thread is context. Legacy workspace-wide memory is never inherited.
          const context=prior.slice(-20).map(m=>({role:m.from_agent==='owner:zed'?'user':'assistant',content:`${m.from_agent}: ${String(m.body||'').slice(0,2000)}`}));
          const response=await this.request(this.agent,'/v1/turn',{message:input,conversation_ref:s.threadRef,context},s.abort.signal);
          if(response.state!=='ANSWERED'||typeof response.reply!=='string') throw new Error('LOCAL_AGENT_REPLY_MISSING');
          result=response.reply;
        }
        const saved=await this.record(s,result,{from:'agent:ibal:r1',to:['owner:zed',...s.participants],subject:'Zed quorum reply'});
        await this.text(s,`${result}\n\nAI Mail return: ${saved.id} (${saved.delivery})\n`);
        return {stopReason:'end_turn'};
      }
      await this.text(s,result+'\n');return {stopReason:'end_turn'};
    } catch(e) {
      await this.text(s,`\nIbal quorum blocked: ${e.message}. No completion is claimed.\n`);
      return {stopReason:s.abort.signal.aborted?'cancelled':'end_turn'};
    } finally {s.busy=false;s.abort=null;}
  }
  cancel({sessionId}) {this.sessions.get(sessionId)?.abort?.abort();}
  close() {for(const s of this.sessions.values()){clearInterval(s.timer);s.abort?.abort();}}
}
