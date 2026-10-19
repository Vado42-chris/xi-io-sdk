#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Readable, Writable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { QuorumAcp } from '../src/cli/quorum-acp.mjs';

// Reuse the ACP SDK already shipped with Ibal; do not fork its protocol implementation.
const sdkRoot=process.env.XIIO_ACP_SDK_ROOT||path.join(os.homedir(),'.local/share/xi-io/agents/ibal-acp-001a/acp-agent');
const acp=createRequire(path.join(sdkRoot,'package.json'))('@agentclientprotocol/sdk');
const options={};
for(const [key,env] of Object.entries({stateDir:'XIIO_QUORUM_STATE_DIR',threadRef:'XIIO_QUORUM_THREAD_REF',ledger:'XIIO_AI_MAIL_LEDGER',controlBase:'XIIO_CONTROL_URL',agentBase:'XIIO_LOCAL_AGENT_URL'})) if(process.env[env]) options[key]=process.env[env];
const manager=new QuorumAcp(options);
const clientFor=ctx=>({sessionUpdate:params=>ctx.client.notify('session/update',params)});
const app=acp.agent({name:'xi-io-ibal-quorum'})
 .onRequest(acp.methods.agent.initialize,()=>({protocolVersion:acp.PROTOCOL_VERSION,agentCapabilities:{loadSession:true},agentInfo:{name:'xi-io-ibal-quorum',version:'0.1.0-alpha'}}))
 .onRequest(acp.methods.agent.session.new,ctx=>manager.newSession(ctx.params,clientFor(ctx)))
 .onRequest(acp.methods.agent.session.load,ctx=>manager.loadSession(ctx.params,clientFor(ctx)))
 .onRequest(acp.methods.agent.session.prompt,ctx=>manager.prompt(ctx.params,clientFor(ctx)))
 .onNotification(acp.methods.agent.session.cancel,ctx=>manager.cancel(ctx.params));
const connection=app.connect(acp.ndJsonStream(Writable.toWeb(process.stdout),Readable.toWeb(process.stdin)));
connection.closed.finally(()=>manager.close()).catch(()=>{});
